-- ==============================================================================
-- Migración: 202609020023_vista_producto_detalle_y_recepcion_modo.sql
-- Propósito: 
--   1. Crear vista consolidada v_producto_detalle con soporte multi-modo
--   2. Adaptar la función conciliar_recepcion ramificando por modo_manejo
--   3. Adaptar la función transferir_carga_entre_almacenes para unidades serializadas
-- ==============================================================================

BEGIN;

-- ============================================================================
-- 1. Vista Consolidada Multi-Modo: v_producto_detalle
-- ============================================================================
CREATE OR REPLACE VIEW public.v_producto_detalle
WITH (security_invoker = true)
AS
SELECT
  p.id_producto,
  p.sku,
  p.nombre,
  p.descripcion,
  p.unidad_medida,
  p.peso_unitario_kg,
  p.costo_unitario,
  p.clasificacion_abc,
  p.activo AS producto_activo,
  p.created_at,
  
  -- Datos de Categoría
  c.id_categoria,
  c.nombre AS categoria_nombre,
  c.descripcion AS categoria_descripcion,
  c.activo AS categoria_activo,
  COALESCE(c.modo_manejo, 'PALETIZADO') AS modo_manejo,
  
  -- Atributos del Modo de Manejo
  m.nombre AS modo_manejo_nombre,
  m.descripcion AS modo_manejo_descripcion,
  COALESCE(m.requiere_regla_empaque, true) AS requiere_regla_empaque,
  COALESCE(m.requiere_serie, false) AS requiere_serie,
  COALESCE(m.permite_puchos, true) AS permite_puchos,

  -- Perfil Paletizado (regla_empaque)
  r.id_empaque,
  r.unidades_por_caja,
  r.cajas_por_camada,
  r.numero_camadas,
  (COALESCE(r.cajas_por_camada, 0) * COALESCE(r.numero_camadas, 0)) AS cajas_por_paleta,
  (COALESCE(r.cajas_por_camada, 0) * COALESCE(r.numero_camadas, 0) * COALESCE(r.unidades_por_caja, 0)) AS unidades_por_paleta,
  r.permite_puchos AS empaque_permite_puchos,
  r.notas_armado,
  r.imagen_armado_path,
  r.largo_caja_cm,
  r.ancho_caja_cm,
  r.alto_caja_cm,
  r.peso_caja_kg,
  CASE
    WHEN r.largo_caja_cm IS NOT NULL AND r.ancho_caja_cm IS NOT NULL AND r.alto_caja_cm IS NOT NULL
    THEN ROUND((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0), 4)
    ELSE NULL
  END AS volumen_caja_m3,
  CASE
    WHEN r.largo_caja_cm IS NOT NULL AND r.ancho_caja_cm IS NOT NULL AND r.alto_caja_cm IS NOT NULL 
         AND r.cajas_por_camada IS NOT NULL AND r.numero_camadas IS NOT NULL
    THEN ROUND(((r.largo_caja_cm * r.ancho_caja_cm * r.alto_caja_cm / 1000000.0) * (r.cajas_por_camada * r.numero_camadas)), 4)
    ELSE NULL
  END AS volumen_paleta_m3,

  -- Perfil Serializado (perfil_serializado)
  ps.peso_unitario_kg AS serial_peso_unitario_kg,
  ps.largo_cm AS serial_largo_cm,
  ps.ancho_cm AS serial_ancho_cm,
  ps.alto_cm AS serial_alto_cm,
  ps.requiere_equipo_izaje AS serial_requiere_equipo_izaje,
  ps.ubicacion_permitida AS serial_ubicacion_permitida,
  ps.atributos AS serial_atributos,
  ps.notas AS serial_notas

FROM public.producto p
LEFT JOIN public.categoria c ON c.id_categoria = p.id_categoria
LEFT JOIN public.modo_manejo m ON m.codigo = COALESCE(c.modo_manejo, 'PALETIZADO')
LEFT JOIN public.regla_empaque r ON r.id_producto = p.id_producto
LEFT JOIN public.perfil_serializado ps ON ps.id_producto = p.id_producto;

GRANT SELECT ON public.v_producto_detalle TO authenticated;

-- ============================================================================
-- 2. Función conciliar_recepcion con Ramificación por Modo de Manejo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.conciliar_recepcion(
  p_id_orden BIGINT,
  p_id_producto BIGINT,
  p_id_almacen BIGINT,
  p_lecturas JSONB,
  p_id_transaccion_offline TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id_usuario BIGINT;
  v_sku TEXT;
  v_modo_manejo VARCHAR(30);
  v_requiere_empaque BOOLEAN;
  v_requiere_serie BOOLEAN;

  v_orden_estado public.orden_estado;
  v_almacen_activo BOOLEAN;
  v_cantidad_pedida INTEGER;
  
  v_unidades_por_caja INTEGER := 1;
  v_cajas_por_paleta INTEGER := 1;
  
  v_total_paletas INTEGER := 0;
  v_total_puchos INTEGER := 0;
  v_total_cajas INTEGER := 0;
  v_total_unidades NUMERIC := 0;

  v_id_sesion BIGINT;
  v_item JSONB;
  v_uid TEXT;
  v_tipo TEXT;
  v_paquetes INTEGER;
  v_numero_serie TEXT;
  v_cajas_item INTEGER;
  v_unidades_item NUMERIC;
  v_id_etiqueta BIGINT;
  v_prod_existente_id BIGINT;
  v_prod_existente_sku TEXT;

  v_estado_conciliacion public.conciliacion_estado;
  v_diferencia NUMERIC;
  v_sesion_previa RECORD;
BEGIN
  -- ---------------------------------------------------------------------------
  -- REGLA 1: VALIDACIÓN DE PERMISOS
  -- ---------------------------------------------------------------------------
  IF NOT (public.tiene_rol(ARRAY['ADMINISTRADOR', 'OPERARIO'])) THEN
    RAISE EXCEPTION 'Acceso denegado: el usuario no tiene rol de ADMINISTRADOR u OPERARIO.';
  END IF;

  SELECT id_usuario INTO v_id_usuario
  FROM public.usuario
  WHERE auth_user_id = auth.uid();

  -- ---------------------------------------------------------------------------
  -- REGLA 2: IDEMPOTENCIA CONTRA DUPLICIDAD EN REINTENTOS OFFLINE
  -- ---------------------------------------------------------------------------
  IF p_id_transaccion_offline IS NOT NULL AND trim(p_id_transaccion_offline) <> '' THEN
    SELECT s.id_sesion, s.estado, c.estado AS conciliacion_estado, c.total_paletas_completas, c.total_paquetes_puchos
    INTO v_sesion_previa
    FROM public.sesion_recepcion s
    LEFT JOIN public.conciliacion_ciega c ON c.id_sesion = s.id_sesion
    WHERE s.id_transaccion_offline = trim(p_id_transaccion_offline);

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotente', true,
        'mensaje', 'Transacción previamente procesada. No se duplicó stock ni lecturas.',
        'id_sesion', v_sesion_previa.id_sesion,
        'estado_conciliacion', v_sesion_previa.conciliacion_estado,
        'paletas_completas', v_sesion_previa.total_paletas_completas,
        'paquetes_puchos', v_sesion_previa.total_paquetes_puchos
      );
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- REGLA 3: VALIDACIONES DE NEGOCIO (ALMACÉN, ORDEN, PRODUCTO, DETALLE)
  -- ---------------------------------------------------------------------------
  -- A. Validar Almacén activo
  SELECT activo INTO v_almacen_activo
  FROM public.almacen
  WHERE id_almacen = p_id_almacen;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El almacén ID % no existe.', p_id_almacen;
  ELSIF NOT v_almacen_activo THEN
    RAISE EXCEPTION 'El almacén ID % se encuentra inactivo.', p_id_almacen;
  END IF;

  -- B. Validar Producto activo y obtener su Modo de Manejo
  SELECT 
    p.sku,
    COALESCE(c.modo_manejo, 'PALETIZADO'),
    COALESCE(m.requiere_regla_empaque, true),
    COALESCE(m.requiere_serie, false)
  INTO 
    v_sku,
    v_modo_manejo,
    v_requiere_empaque,
    v_requiere_serie
  FROM public.producto p
  LEFT JOIN public.categoria c ON c.id_categoria = p.id_categoria
  LEFT JOIN public.modo_manejo m ON m.codigo = COALESCE(c.modo_manejo, 'PALETIZADO')
  WHERE p.id_producto = p_id_producto AND p.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto ID % no existe o está inactivo.', p_id_producto;
  END IF;

  -- C. Validar Orden de Importación en estado válido
  SELECT estado INTO v_orden_estado
  FROM public.orden_importacion
  WHERE id_orden = p_id_orden;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden de importación ID % no existe.', p_id_orden;
  ELSIF v_orden_estado IN ('RECIBIDA', 'CANCELADA') THEN
    RAISE EXCEPTION 'La orden ID % no puede recibir mercancía (estado actual: %).', p_id_orden, v_orden_estado;
  END IF;

  -- D. Validar que el producto pertenezca a la orden
  SELECT cantidad_pedida INTO v_cantidad_pedida
  FROM public.detalle_orden
  WHERE id_orden = p_id_orden AND id_producto = p_id_producto;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto [%] (ID %) no forma parte de la orden ID %.', v_sku, p_id_producto, p_id_orden;
  ELSIF v_cantidad_pedida <= 0 THEN
    RAISE EXCEPTION 'La orden ID % tiene una cantidad pedida inválida (% unid).', p_id_orden, v_cantidad_pedida;
  END IF;

  -- E. Validar lote JSON de lecturas
  IF p_lecturas IS NULL OR jsonb_typeof(p_lecturas) <> 'array' OR jsonb_array_length(p_lecturas) = 0 THEN
    RAISE EXCEPTION 'El lote de lecturas RFID debe ser un arreglo JSON con al menos un elemento.';
  END IF;

  -- F. Verificar UIDs duplicados en el lote
  IF EXISTS (
    SELECT trim(item->>'uid')
    FROM jsonb_array_elements(p_lecturas) item
    GROUP BY trim(item->>'uid')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Lote inválido: se detectaron etiquetas UID duplicadas dentro de la misma sesión.';
  END IF;

  -- ===========================================================================
  -- RAMIFICACIÓN 1: MODO SERIALIZADO (Maquinaria y Equipos Únicos)
  -- ===========================================================================
  IF v_requiere_serie = true THEN

    -- Verificar números de serie duplicados en el lote recibido
    IF EXISTS (
      SELECT COALESCE(NULLIF(trim(item->>'numero_serie'), ''), NULLIF(trim(item->>'serie'), ''), trim(item->>'uid'))
      FROM jsonb_array_elements(p_lecturas) item
      GROUP BY COALESCE(NULLIF(trim(item->>'numero_serie'), ''), NULLIF(trim(item->>'serie'), ''), trim(item->>'uid'))
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Lote serializado inválido: se detectaron números de serie duplicados en el lote.';
    END IF;

    -- Validar cada item serializado
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lecturas)
    LOOP
      v_uid := trim(COALESCE(v_item->>'uid', ''));
      v_numero_serie := trim(COALESCE(v_item->>'numero_serie', v_item->>'serie', ''));

      IF v_uid = '' THEN
        RAISE EXCEPTION 'Lectura inválida: se encontró un equipo sin UID RFID.';
      END IF;

      IF v_numero_serie = '' THEN
        RAISE EXCEPTION 'El tag UID "%" del producto [%] debe especificar su número de serie.', v_uid, v_sku;
      END IF;

      -- Verificar que el tag no pertenezca ya a otro producto
      SELECT e.id_producto, p.sku
      INTO v_prod_existente_id, v_prod_existente_sku
      FROM public.etiqueta_rfid e
      JOIN public.producto p ON p.id_producto = e.id_producto
      WHERE e.uid_tag = v_uid;

      IF FOUND AND v_prod_existente_id <> p_id_producto THEN
        RAISE EXCEPTION 'Seguridad RFID: El tag UID "%" ya está asignado al producto [%] y no puede reasignarse a [%].',
          v_uid, v_prod_existente_sku, v_sku;
      END IF;

      v_total_unidades := v_total_unidades + 1;
    END LOOP;

    -- Registro de la Sesión de Recepción
    INSERT INTO public.sesion_recepcion (
      id_orden, id_producto, id_almacen, id_usuario, estado,
      total_paletas_completas, total_paquetes_puchos, id_transaccion_offline,
      fecha_inicio, fecha_finalizacion
    )
    VALUES (
      p_id_orden, p_id_producto, p_id_almacen, v_id_usuario, 'FINALIZADA',
      0, 0, NULLIF(trim(p_id_transaccion_offline), ''), now(), now()
    )
    RETURNING id_sesion INTO v_id_sesion;

    -- Registro de Tags RFID, Unidades Serializadas y Lecturas
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lecturas)
    LOOP
      v_uid := trim(v_item->>'uid');
      v_numero_serie := trim(COALESCE(v_item->>'numero_serie', v_item->>'serie', ''));

      -- 1. Enrolar o actualizar tag RFID individual
      INSERT INTO public.etiqueta_rfid (
        uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
        cantidad_actual, estado, id_almacen_actual, notas
      )
      VALUES (
        v_uid, p_id_producto, 'COMPLETO', 1, 1, 'ACTIVA', p_id_almacen,
        format('Serializado serie: %s', v_numero_serie)
      )
      ON CONFLICT (uid_tag) DO UPDATE SET
        id_producto = excluded.id_producto,
        tipo_paleta = 'COMPLETO',
        cantidad_paquetes = 1,
        cantidad_actual = 1,
        estado = 'ACTIVA',
        id_almacen_actual = excluded.id_almacen_actual,
        notas = excluded.notas
      RETURNING id_etiqueta INTO v_id_etiqueta;

      -- 2. Registrar o actualizar unidad_serializada física
      INSERT INTO public.unidad_serializada (
        id_producto, numero_serie, id_etiqueta, id_almacen, estado, fecha_ingreso
      )
      VALUES (
        p_id_producto, v_numero_serie, v_id_etiqueta, p_id_almacen, 'DISPONIBLE', now()
      )
      ON CONFLICT (id_producto, numero_serie) DO UPDATE SET
        id_etiqueta = excluded.id_etiqueta,
        id_almacen = excluded.id_almacen,
        estado = 'DISPONIBLE',
        updated_at = now();

      -- 3. Bitácora de lectura
      INSERT INTO public.recepcion_lectura (
        id_sesion, id_etiqueta, uid_tag, tipo_carga,
        cantidad_paquetes, cantidad_unidades, valido
      )
      VALUES (
        v_id_sesion, v_id_etiqueta, v_uid, 'COMPLETO', 1, 1, true
      );
    END LOOP;

  -- ===========================================================================
  -- RAMIFICACIÓN 2: MODO PALETIZADO (Comportamiento Estándar Conservado)
  -- ===========================================================================
  ELSE
    -- Buscar regla de empaque obligatoria
    SELECT
      COALESCE(r.unidades_por_caja, 0),
      CASE
        WHEN COALESCE(r.cajas_por_camada, 0) > 0 AND COALESCE(r.numero_camadas, 0) > 0
          THEN (r.cajas_por_camada * r.numero_camadas)
        WHEN COALESCE(r.cajas_por_camita, 0) > 0 AND COALESCE(r.camitas_por_paleta, 0) > 0
          THEN (r.cajas_por_camita * r.camitas_por_paleta)
        ELSE 0
      END
    INTO v_unidades_por_caja, v_cajas_por_paleta
    FROM public.regla_empaque r
    WHERE r.id_producto = p_id_producto;

    IF NOT FOUND OR v_unidades_por_caja <= 0 OR v_cajas_por_paleta <= 0 THEN
      RAISE EXCEPTION 'El producto [%] no posee una regla de empaque válida (cajas_por_paleta > 0 y unidades_por_caja > 0).', v_sku;
    END IF;

    -- Validar tipos permitidos y puchos > 0
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lecturas)
    LOOP
      v_uid := trim(COALESCE(v_item->>'uid', ''));
      v_tipo := upper(trim(COALESCE(v_item->>'tipo', '')));
      v_paquetes := COALESCE((v_item->>'cantidad_paquetes')::integer, 0);

      IF v_uid = '' THEN
        RAISE EXCEPTION 'Lectura inválida: se encontró un tag sin UID.';
      END IF;

      IF v_tipo NOT IN ('COMPLETO', 'PUCHO') THEN
        RAISE EXCEPTION 'Tipo de paleta inválido "%" en tag UID %. Solo se admite "COMPLETO" o "PUCHO".', v_tipo, v_uid;
      END IF;

      IF v_tipo = 'PUCHO' AND v_paquetes <= 0 THEN
        RAISE EXCEPTION 'Tag de pucho UID % debe especificar una cantidad de paquetes mayor a 0.', v_uid;
      END IF;

      -- Verificar que el tag no pertenezca a otro producto
      SELECT e.id_producto, p.sku
      INTO v_prod_existente_id, v_prod_existente_sku
      FROM public.etiqueta_rfid e
      JOIN public.producto p ON p.id_producto = e.id_producto
      WHERE e.uid_tag = v_uid;

      IF FOUND AND v_prod_existente_id <> p_id_producto THEN
        RAISE EXCEPTION 'Seguridad RFID: El tag UID "%" ya está asignado al producto [%] y no puede reasignarse a [%].',
          v_uid, v_prod_existente_sku, v_sku;
      END IF;

      IF v_tipo = 'COMPLETO' THEN
        v_total_paletas := v_total_paletas + 1;
      ELSE
        v_total_puchos := v_total_puchos + v_paquetes;
      END IF;
    END LOOP;

    v_total_cajas := (v_total_paletas * v_cajas_por_paleta) + v_total_puchos;
    v_total_unidades := v_total_cajas * v_unidades_por_caja;

    -- Registro de la Sesión
    INSERT INTO public.sesion_recepcion (
      id_orden, id_producto, id_almacen, id_usuario, estado,
      total_paletas_completas, total_paquetes_puchos, id_transaccion_offline,
      fecha_inicio, fecha_finalizacion
    )
    VALUES (
      p_id_orden, p_id_producto, p_id_almacen, v_id_usuario, 'FINALIZADA',
      v_total_paletas, v_total_puchos, NULLIF(trim(p_id_transaccion_offline), ''), now(), now()
    )
    RETURNING id_sesion INTO v_id_sesion;

    -- Inserción de Detalle de Paletas
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lecturas)
    LOOP
      v_uid := trim(v_item->>'uid');
      v_tipo := upper(trim(v_item->>'tipo'));
      v_paquetes := COALESCE((v_item->>'cantidad_paquetes')::integer, 0);

      IF v_tipo = 'COMPLETO' THEN
        v_cajas_item := v_cajas_por_paleta;
        v_unidades_item := v_cajas_por_paleta * v_unidades_por_caja;
      ELSE
        v_cajas_item := v_paquetes;
        v_unidades_item := v_paquetes * v_unidades_por_caja;
      END IF;

      INSERT INTO public.etiqueta_rfid (
        uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
        cantidad_actual, estado, id_almacen_actual
      )
      VALUES (
        v_uid, p_id_producto, v_tipo::public.tipo_paleta,
        v_cajas_item, v_unidades_item, 'ACTIVA', p_id_almacen
      )
      ON CONFLICT (uid_tag) DO UPDATE SET
        tipo_paleta = excluded.tipo_paleta,
        cantidad_paquetes = excluded.cantidad_paquetes,
        cantidad_actual = excluded.cantidad_actual,
        estado = 'ACTIVA',
        id_almacen_actual = excluded.id_almacen_actual
      RETURNING id_etiqueta INTO v_id_etiqueta;

      INSERT INTO public.recepcion_lectura (
        id_sesion, id_etiqueta, uid_tag, tipo_carga,
        cantidad_paquetes, cantidad_unidades, valido
      )
      VALUES (
        v_id_sesion, v_id_etiqueta, v_uid, v_tipo::public.tipo_paleta,
        v_cajas_item, v_unidades_item, true
      );
    END LOOP;

  END IF;

  -- ---------------------------------------------------------------------------
  -- REGLA COMÚN: CONCILIACIÓN CIEGA
  -- ---------------------------------------------------------------------------
  v_diferencia := v_total_unidades - v_cantidad_pedida;

  IF v_diferencia = 0 THEN
    v_estado_conciliacion := 'COMPLETA';
  ELSIF v_diferencia < 0 THEN
    v_estado_conciliacion := 'FALTANTES';
  ELSE
    v_estado_conciliacion := 'SOBRANTES';
  END IF;

  INSERT INTO public.conciliacion_ciega (
    id_sesion, tags_esperados, tags_leidos, total_paletas_completas,
    total_paquetes_puchos, estado
  )
  VALUES (
    v_id_sesion,
    CASE
      WHEN v_requiere_serie = true THEN v_cantidad_pedida
      WHEN (v_cajas_por_paleta * v_unidades_por_caja) > 0
        THEN ceil(v_cantidad_pedida::numeric / (v_cajas_por_paleta * v_unidades_por_caja))::integer
      ELSE 0
    END,
    jsonb_array_length(p_lecturas),
    v_total_paletas,
    v_total_puchos,
    v_estado_conciliacion
  );

  -- ---------------------------------------------------------------------------
  -- REGLA COMÚN: ACTUALIZACIÓN DE INVENTARIO Y MOVIMIENTO ATÓMICOS
  -- ---------------------------------------------------------------------------
  INSERT INTO public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo
  )
  VALUES (
    p_id_producto,
    p_id_almacen,
    v_total_unidades,
    CASE WHEN v_requiere_serie = true THEN 1 ELSE (v_cajas_por_paleta * v_unidades_por_caja) END,
    'VERDE'
  )
  ON CONFLICT (id_producto, id_almacen) DO UPDATE SET
    stock_real = public.inventario.stock_real + excluded.stock_real,
    estado_semaforo = CASE
      WHEN (public.inventario.stock_real + excluded.stock_real) <= 0 THEN 'ROJO'
      WHEN (public.inventario.stock_real + excluded.stock_real) <= public.inventario.stock_minimo THEN 'AMARILLO'
      ELSE 'VERDE'
    END;

  INSERT INTO public.movimiento (
    id_usuario,
    id_producto,
    tipo,
    cantidad_afectada,
    destino_almacen,
    id_sesion,
    motivo
  )
  VALUES (
    v_id_usuario,
    p_id_producto,
    'INGRESO_COMPLETO',
    v_total_unidades,
    p_id_almacen,
    v_id_sesion,
    CASE 
      WHEN v_requiere_serie = true THEN
        format('Recepción Serializada Orden #%s [%s]: %s unidades (%s)',
          p_id_orden, v_sku, v_total_unidades, v_estado_conciliacion)
      ELSE
        format('Recepción RFID Orden #%s [%s]: %s paletas + %s puchos = %s unidades (%s)',
          p_id_orden, v_sku, v_total_paletas, v_total_puchos, v_total_unidades, v_estado_conciliacion)
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotente', false,
    'id_sesion', v_id_sesion,
    'modo_manejo', v_modo_manejo,
    'estado_conciliacion', v_estado_conciliacion,
    'cantidad_esperada', v_cantidad_pedida,
    'cantidad_recibida', v_total_unidades,
    'diferencia_unidades', v_diferencia,
    'paletas_completas', v_total_paletas,
    'paquetes_puchos', v_total_puchos,
    'tags_procesados', jsonb_array_length(p_lecturas)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.conciliar_recepcion(BIGINT, BIGINT, BIGINT, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- 3. Función transferir_carga_entre_almacenes con Soporte para Serializado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transferir_carga_entre_almacenes(
  p_uid_origen TEXT,
  p_id_almacen_origen BIGINT,
  p_id_almacen_destino BIGINT,
  p_motivo TEXT DEFAULT 'Transferencia entre almacenes'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id_usuario BIGINT;
  v_origen public.etiqueta_rfid%ROWTYPE;
  v_pucho_dest public.etiqueta_rfid%ROWTYPE;
  v_hay_pucho_dest BOOLEAN := false;

  v_sku TEXT;
  v_nombre_destino TEXT;
  v_modo_manejo VARCHAR(30);
  v_requiere_empaque BOOLEAN;
  v_requiere_serie BOOLEAN;

  v_unidades_por_caja INTEGER;
  v_cajas_por_paleta INTEGER;
  v_total_cajas INTEGER;
  v_resto INTEGER;

  v_uid_principal TEXT;
  v_uid_resto TEXT;
  v_uid_cerrado TEXT;
  v_id_etiqueta_destino BIGINT;
  v_id_etiqueta_resto BIGINT;
  v_alerta BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para transferir carga.';
  END IF;

  IF p_id_almacen_origen = p_id_almacen_destino THEN
    RAISE EXCEPTION 'El almacén destino debe ser distinto del almacén de origen.';
  END IF;

  SELECT u.id_usuario INTO v_id_usuario
  FROM public.usuario u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no válido o inactivo.';
  END IF;

  SELECT a.nombre INTO v_nombre_destino
  FROM public.almacen a
  WHERE a.id_almacen = p_id_almacen_destino AND a.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El almacén destino (#%) no existe o está inactivo.', p_id_almacen_destino;
  END IF;

  SELECT * INTO v_origen
  FROM public.etiqueta_rfid
  WHERE uid_tag = trim(p_uid_origen)
    AND id_almacen_actual = p_id_almacen_origen
    AND estado = 'ACTIVA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La etiqueta % no está activa en el almacén origen.', p_uid_origen;
  END IF;

  IF v_origen.cantidad_actual <= 0 OR v_origen.cantidad_paquetes <= 0 THEN
    RAISE EXCEPTION 'La etiqueta % no tiene cantidad para transferir.', p_uid_origen;
  END IF;

  SELECT 
    p.sku,
    COALESCE(c.modo_manejo, 'PALETIZADO'),
    COALESCE(m.requiere_regla_empaque, true),
    COALESCE(m.requiere_serie, false)
  INTO 
    v_sku,
    v_modo_manejo,
    v_requiere_empaque,
    v_requiere_serie
  FROM public.producto p
  LEFT JOIN public.categoria c ON c.id_categoria = p.id_categoria
  LEFT JOIN public.modo_manejo m ON m.codigo = COALESCE(c.modo_manejo, 'PALETIZADO')
  WHERE p.id_producto = v_origen.id_producto;

  -- ===========================================================================
  -- TRANSFERENCIA MODO SERIALIZADO
  -- ===========================================================================
  IF v_requiere_serie = true THEN
    v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

    v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
      v_uid_principal, v_origen.id_producto, 'COMPLETO',
      1, 1, p_id_almacen_destino, 'Transferencia serializada desde ' || v_origen.uid_tag
    );

    -- Actualizar unidad serializada
    UPDATE public.unidad_serializada
    SET 
      id_etiqueta = v_id_etiqueta_destino,
      id_almacen = p_id_almacen_destino,
      updated_at = now()
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Cerrar tag origen
    UPDATE public.etiqueta_rfid
    SET estado = 'VACIA', id_almacen_actual = NULL, id_celda = NULL, notas = 'Transferido serializado a ' || v_nombre_destino
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Ajuste de stock en inventario
    UPDATE public.inventario
    SET stock_real = GREATEST(0, stock_real - 1)
    WHERE id_producto = v_origen.id_producto AND id_almacen = p_id_almacen_origen;

    INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
    VALUES (v_origen.id_producto, p_id_almacen_destino, 1, 1, 'VERDE')
    ON CONFLICT (id_producto, id_almacen) DO UPDATE SET
      stock_real = public.inventario.stock_real + 1;

    -- Registrar movimiento Kardex
    INSERT INTO public.movimiento (id_usuario, id_producto, tipo, cantidad_afectada, destino_almacen, motivo)
    VALUES (
      v_id_usuario, v_origen.id_producto, 'TRANSFERENCIA', 1, p_id_almacen_destino,
      format('Transferencia serializada tag %s -> %s hacia %s (%s)', v_origen.uid_tag, v_uid_principal, v_nombre_destino, p_motivo)
    );

    RETURN jsonb_build_object(
      'ok', true,
      'modo_manejo', 'SERIALIZADO',
      'mensaje', 'Unidad serializada transferida con éxito.',
      'uid_nuevo_destino', v_uid_principal,
      'unidades_transferidas', 1
    );

  -- ===========================================================================
  -- TRANSFERENCIA MODO PALETIZADO (Comportamiento Estándar Conservado)
  -- ===========================================================================
  ELSE
    SELECT
      re.unidades_por_caja,
      COALESCE(
        re.cajas_por_camada * re.numero_camadas,
        re.cajas_por_camita * re.camitas_por_paleta
      )
    INTO v_unidades_por_caja, v_cajas_por_paleta
    FROM public.regla_empaque re
    WHERE re.id_producto = v_origen.id_producto;

    IF NOT FOUND OR COALESCE(v_unidades_por_caja, 0) <= 0 OR COALESCE(v_cajas_por_paleta, 0) <= 0 THEN
      RAISE EXCEPTION 'El producto % no tiene una regla de empaque válida.', v_sku;
    END IF;

    -- CASO 1: PALETA COMPLETA
    IF v_origen.tipo_paleta = 'COMPLETO' THEN
      v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

      v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
        v_uid_principal, v_origen.id_producto, 'COMPLETO',
        v_origen.cantidad_paquetes, v_origen.cantidad_actual,
        p_id_almacen_destino, 'Transferida desde ' || v_origen.uid_tag
      );

    -- CASO 2: PUCHO
    ELSE
      SELECT * INTO v_pucho_dest
      FROM public.etiqueta_rfid
      WHERE id_producto = v_origen.id_producto
        AND id_almacen_actual = p_id_almacen_destino
        AND tipo_paleta = 'PUCHO'
        AND estado = 'ACTIVA'
      FOR UPDATE;

      v_hay_pucho_dest := FOUND;
      v_total_cajas := v_origen.cantidad_paquetes + CASE WHEN v_hay_pucho_dest THEN v_pucho_dest.cantidad_paquetes ELSE 0 END;

      IF v_total_cajas < v_cajas_por_paleta THEN
        IF v_hay_pucho_dest THEN
          v_uid_principal := v_pucho_dest.uid_tag;
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_pucho_dest.uid_tag, v_origen.id_producto, 'PUCHO',
            v_total_cajas, v_total_cajas * v_unidades_por_caja,
            p_id_almacen_destino, 'Consolidado con ' || v_origen.uid_tag
          );
        ELSE
          v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_uid_principal, v_origen.id_producto, 'PUCHO',
            v_total_cajas, v_total_cajas * v_unidades_por_caja,
            p_id_almacen_destino, 'Transferido pucho desde ' || v_origen.uid_tag
          );
        END IF;

      ELSIF v_total_cajas = v_cajas_por_paleta THEN
        IF v_hay_pucho_dest THEN
          v_uid_principal := v_pucho_dest.uid_tag;
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_pucho_dest.uid_tag, v_origen.id_producto, 'COMPLETO',
            v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
            p_id_almacen_destino, 'Pucho completado con ' || v_origen.uid_tag
          );
        ELSE
          v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_uid_principal, v_origen.id_producto, 'COMPLETO',
            v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
            p_id_almacen_destino, 'Pucho completado desde ' || v_origen.uid_tag
          );
        END IF;
        v_alerta := true;

      ELSE
        v_resto := v_total_cajas - v_cajas_por_paleta;

        IF v_hay_pucho_dest THEN
          v_uid_principal := v_pucho_dest.uid_tag;
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_pucho_dest.uid_tag, v_origen.id_producto, 'COMPLETO',
            v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
            p_id_almacen_destino, 'Pucho completado con ' || v_origen.uid_tag
          );
        ELSE
          v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);
          v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
            v_uid_principal, v_origen.id_producto, 'COMPLETO',
            v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
            p_id_almacen_destino, 'Pucho completado desde ' || v_origen.uid_tag
          );
        END IF;

        v_uid_resto := public.generar_uid_rfid(p_id_almacen_destino);
        v_id_etiqueta_resto := public._asignar_etiqueta_rfid(
          v_uid_resto, v_origen.id_producto, 'PUCHO',
          v_resto, v_resto * v_unidades_por_caja,
          p_id_almacen_destino, 'Sobrante de transferencia desde ' || v_origen.uid_tag
        );
        v_alerta := true;
      END IF;
    END IF;

    -- Cerrar tag origen
    UPDATE public.etiqueta_rfid
    SET estado = 'VACIA', id_almacen_actual = NULL, id_celda = NULL, notas = 'Transferido a ' || v_nombre_destino
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Ajustes de stock e inventario
    UPDATE public.inventario
    SET stock_real = GREATEST(0, stock_real - v_origen.cantidad_actual)
    WHERE id_producto = v_origen.id_producto AND id_almacen = p_id_almacen_origen;

    INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
    VALUES (v_origen.id_producto, p_id_almacen_destino, v_origen.cantidad_actual, (v_cajas_por_paleta * v_unidades_por_caja), 'VERDE')
    ON CONFLICT (id_producto, id_almacen) DO UPDATE SET
      stock_real = public.inventario.stock_real + excluded.stock_real;

    -- Movimiento Kardex
    INSERT INTO public.movimiento (id_usuario, id_producto, tipo, cantidad_afectada, destino_almacen, motivo)
    VALUES (
      v_id_usuario, v_origen.id_producto, 'TRANSFERENCIA', v_origen.cantidad_actual, p_id_almacen_destino,
      format('Transferencia tag %s hacia %s (%s)', v_origen.uid_tag, v_nombre_destino, p_motivo)
    );

    IF v_alerta THEN
      INSERT INTO public.alerta_sistema (tipo_alerta, id_producto, id_almacen, mensaje)
      VALUES (
        'PUCHO_COMPLETADO', v_origen.id_producto, p_id_almacen_destino,
        format('Se completó una paleta completa para %s en %s por transferencia.', v_sku, v_nombre_destino)
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'modo_manejo', 'PALETIZADO',
      'mensaje', 'Carga paletizada transferida con éxito.',
      'uid_nuevo_destino', v_uid_principal,
      'uid_resto_sobrante', v_uid_resto,
      'unidades_transferidas', v_origen.cantidad_actual,
      'alerta_paleta_completada', v_alerta
    );
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_carga_entre_almacenes(TEXT, BIGINT, BIGINT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
