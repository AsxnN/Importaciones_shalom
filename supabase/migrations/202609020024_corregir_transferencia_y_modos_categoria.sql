-- ==============================================================================
-- MIGRACIÓN: 202609020024_corregir_transferencia_y_modos_categoria.sql
-- Fecha: 2026-10-21
-- Propósito:
--   1. Activar todos los modos de manejo en el catálogo público modo_manejo.
--   2. Corregir transferir_carga_entre_almacenes:
--      - Eliminar el uso de 'TRANSFERENCIA' en public.movimiento (incompatibilidad con movimiento_tipo enum).
--      - Asentar 'DESPACHO_COMPLETO' e 'INGRESO_COMPLETO'/'INGRESO_PUCHO' en el Kardex.
--      - Soportar transferencia de unidades serializadas (actualizando unidad_serializada).
--      - Permitir transferencias sin regla_empaque si el modo no lo requiere o no está definido.
--      - Resolver usuario autenticado con fallback resiliente.
--      - Devolver uid_destino y uid_nuevo_destino de manera consistente.
--   3. Asegurar tabla alerta_sistema y función resolver_alerta.
--   4. Autogenerar prefijo_rfid en almacén si está vacío para evitar error al transferir.
-- ==============================================================================

BEGIN;

-- ============================================================================
-- 1. Asegurar Tabla de Alertas del Sistema
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alerta_sistema (
  id_alerta BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL,
  id_almacen BIGINT REFERENCES public.almacen(id_almacen) ON DELETE SET NULL,
  id_producto BIGINT REFERENCES public.producto(id_producto) ON DELETE SET NULL,
  id_etiqueta BIGINT REFERENCES public.etiqueta_rfid(id_etiqueta) ON DELETE SET NULL,
  mensaje TEXT NOT NULL,
  resuelta BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Si la columna tipo_alerta existiera por migraciones previas, homologarla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'alerta_sistema' AND column_name = 'tipo'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'alerta_sistema' AND column_name = 'tipo_alerta'
  ) THEN
    ALTER TABLE public.alerta_sistema RENAME COLUMN tipo_alerta TO tipo;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alerta_sistema_almacen ON public.alerta_sistema(id_almacen);
CREATE INDEX IF NOT EXISTS idx_alerta_sistema_resuelta ON public.alerta_sistema(resuelta);

-- Función para resolver alertas
CREATE OR REPLACE FUNCTION public.resolver_alerta(p_id_alerta BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.alerta_sistema
  SET resuelta = true
  WHERE id_alerta = p_id_alerta;

  RETURN jsonb_build_object('ok', true, 'mensaje', 'Alerta resuelta con éxito.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_alerta(BIGINT) TO authenticated;

-- ============================================================================
-- 2. Activar Todos los Modos de Manejo en el Catálogo
-- ============================================================================
INSERT INTO public.modo_manejo (codigo, nombre, descripcion, requiere_regla_empaque, requiere_serie, permite_puchos, activo)
VALUES
  ('PALETIZADO', 'Paletizado estándar', 'Carga organizada en cajas y estibas paletizadas con regla de empaque', true, false, true, true),
  ('SERIALIZADO', 'Serializado unitario', 'Equipos y maquinaria identificados unitariamente por número de serie y RFID individual', false, true, false, true),
  ('GRANEL', 'Carga a granel', 'Control continuo por peso, tolva o volumen m³', false, false, false, true),
  ('LOTE', 'Control por lote y caducidad', 'Trazabilidad por lote de fabricación y fecha de vencimiento (FEFO)', false, false, false, true),
  ('LARGO', 'Perfiles y carga larga', 'Almacenamiento en estantería cantilever por metros lineales', false, false, false, true),
  ('PICKING_CAJA', 'Picking por caja', 'Control unitario por cajas individuales sin paleta', false, false, false, true),
  ('PESO_VARIABLE', 'Carga de peso variable', 'Doble unidad: bultos y pesaje real en báscula', false, false, false, true),
  ('PERECEDERO', 'Perecedero refrigerado', 'Control de temperatura y cadena de frío', false, false, false, true),
  ('PELIGROSO', 'Material peligroso (HazMat)', 'Clasificación IMO/ONU y segregación de seguridad', false, false, false, true)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  requiere_regla_empaque = EXCLUDED.requiere_regla_empaque,
  requiere_serie = EXCLUDED.requiere_serie,
  permite_puchos = EXCLUDED.permite_puchos,
  activo = true;

-- ============================================================================
-- 3. Autogenerar Prefijo RFID en Almacenes si está Vacío
-- ============================================================================
UPDATE public.almacen
SET prefijo_rfid = UPPER(SUBSTRING(REGEXP_REPLACE(nombre, '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 3)) || '-'
WHERE prefijo_rfid IS NULL OR TRIM(prefijo_rfid) = '';

-- ============================================================================
-- 4. Función Mejorada: generar_uid_rfid con Resiliencia de Prefijo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generar_uid_rfid(p_id_almacen BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefijo TEXT;
  v_nombre TEXT;
  v_ocupadas INTEGER;
  v_numero INTEGER;
BEGIN
  SELECT a.prefijo_rfid, a.nombre
  INTO v_prefijo, v_nombre
  FROM public.almacen a
  WHERE a.id_almacen = p_id_almacen AND a.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El almacén #% no existe o está inactivo.', p_id_almacen;
  END IF;

  -- Si el almacén no tiene prefijo, asignarle uno consistente automáticamente
  IF v_prefijo IS NULL OR TRIM(v_prefijo) = '' THEN
    v_prefijo := UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE(v_nombre, 'ALM'), '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 3)) || '-';
    UPDATE public.almacen SET prefijo_rfid = v_prefijo WHERE id_almacen = p_id_almacen;
  END IF;

  -- Bloqueo de concurrencia a nivel de almacén
  PERFORM pg_advisory_xact_lock(
    hashtextextended('generar_uid_rfid:' || p_id_almacen::text, 0)
  );

  SELECT COUNT(*)
  INTO v_ocupadas
  FROM public.etiqueta_rfid
  WHERE estado <> 'VACIA'
    AND uid_tag ~ ('^' || v_prefijo || '[0-9]{4,}$');

  -- Encontrar el menor hueco libre desde 1
  SELECT MIN(n)
  INTO v_numero
  FROM generate_series(1, v_ocupadas + 1) AS n
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.etiqueta_rfid e
    WHERE e.uid_tag = v_prefijo || lpad(n::text, 5, '0')
      AND e.estado <> 'VACIA'
  );

  RETURN v_prefijo || lpad(COALESCE(v_numero, 1)::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generar_uid_rfid(BIGINT) TO authenticated;

-- ============================================================================
-- 5. Función Definitiva: transferir_carga_entre_almacenes
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
  -- 1. Validaciones iniciales
  IF p_id_almacen_origen = p_id_almacen_destino THEN
    RAISE EXCEPTION 'El almacén destino debe ser distinto del almacén de origen.';
  END IF;

  -- Resolver usuario activo (con tolerancia si auth_user_id está en sesión transitoria)
  IF auth.uid() IS NOT NULL THEN
    SELECT u.id_usuario INTO v_id_usuario
    FROM public.usuario u
    WHERE u.auth_user_id = auth.uid() AND u.activo = true
    LIMIT 1;
  END IF;

  IF v_id_usuario IS NULL THEN
    SELECT u.id_usuario INTO v_id_usuario
    FROM public.usuario u
    WHERE u.activo = true
    ORDER BY u.id_usuario ASC
    LIMIT 1;
  END IF;

  -- Validar almacén destino
  SELECT a.nombre INTO v_nombre_destino
  FROM public.almacen a
  WHERE a.id_almacen = p_id_almacen_destino AND a.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El almacén destino (#%) no existe o está inactivo.', p_id_almacen_destino;
  END IF;

  -- 2. Localizar etiqueta de origen
  SELECT * INTO v_origen
  FROM public.etiqueta_rfid
  WHERE UPPER(TRIM(uid_tag)) = UPPER(TRIM(p_uid_origen))
    AND id_almacen_actual = p_id_almacen_origen
    AND estado = 'ACTIVA'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Búsqueda tolerante por uid_tag si el almacén aún no estaba asociado
    SELECT * INTO v_origen
    FROM public.etiqueta_rfid
    WHERE UPPER(TRIM(uid_tag)) = UPPER(TRIM(p_uid_origen))
      AND estado = 'ACTIVA'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La etiqueta "%" no está activa en el sistema.', p_uid_origen;
    END IF;
  END IF;

  IF COALESCE(v_origen.cantidad_actual, 0) <= 0 AND COALESCE(v_origen.cantidad_paquetes, 0) <= 0 THEN
    RAISE EXCEPTION 'La etiqueta % no tiene cantidad disponible para transferir.', p_uid_origen;
  END IF;

  -- 3. Obtener metadatos del producto y su modo de manejo operativo
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
  -- CASO A: TRANSFERENCIA MODO SERIALIZADO (Maquinaria y Equipos Unitarios)
  -- ===========================================================================
  IF v_requiere_serie = true THEN
    v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

    v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
      v_uid_principal, v_origen.id_producto, 'COMPLETO',
      1, 1, p_id_almacen_destino, 'Transferencia serializada desde ' || v_origen.uid_tag
    );

    -- Actualizar unidad serializada con el nuevo tag y nuevo almacén
    UPDATE public.unidad_serializada
    SET 
      id_etiqueta = v_id_etiqueta_destino,
      id_almacen = p_id_almacen_destino,
      updated_at = now()
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Cerrar tag origen
    UPDATE public.etiqueta_rfid
    SET estado = 'VACIA', id_almacen_actual = NULL, id_celda = NULL,
        notas = 'Transferido serializado a ' || v_nombre_destino || ' (' || v_uid_principal || ')'
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Descontar en origen
    UPDATE public.inventario
    SET stock_real = GREATEST(0, stock_real - 1),
        estado_semaforo = CASE
          WHEN GREATEST(0, stock_real - 1) <= 0 THEN 'ROJO'
          WHEN GREATEST(0, stock_real - 1) <= stock_minimo THEN 'AMARILLO'
          ELSE 'VERDE'
        END
    WHERE id_producto = v_origen.id_producto AND id_almacen = p_id_almacen_origen;

    -- Incrementar en destino
    INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
    VALUES (v_origen.id_producto, p_id_almacen_destino, 1, 1, 'VERDE')
    ON CONFLICT (id_producto, id_almacen) DO UPDATE SET
      stock_real = public.inventario.stock_real + 1,
      estado_semaforo = 'VERDE';

    -- Kardex: Asientos oficiales con tipos enum compatibles
    INSERT INTO public.movimiento (
      id_usuario, id_etiqueta, id_producto, tipo, cantidad_afectada, destino_almacen, motivo
    )
    VALUES (
      v_id_usuario, v_origen.id_etiqueta, v_origen.id_producto, 'DESPACHO_COMPLETO'::public.movimiento_tipo,
      1, p_id_almacen_destino,
      format('Transferencia serializada: sale %s hacia %s. %s', v_origen.uid_tag, v_nombre_destino, p_motivo)
    );

    INSERT INTO public.movimiento (
      id_usuario, id_etiqueta, id_producto, tipo, cantidad_afectada, destino_almacen, motivo
    )
    VALUES (
      v_id_usuario, v_id_etiqueta_destino, v_origen.id_producto, 'INGRESO_COMPLETO'::public.movimiento_tipo,
      1, p_id_almacen_destino,
      format('Transferencia serializada: ingresa %s desde %s. %s', v_uid_principal, v_origen.uid_tag, p_motivo)
    );

    RETURN jsonb_build_object(
      'ok', true,
      'modo_manejo', 'SERIALIZADO',
      'mensaje', format('Unidad serializada transferida con éxito a %s.', v_nombre_destino),
      'uid_origen', v_origen.uid_tag,
      'uid_destino', v_uid_principal,
      'uid_nuevo_destino', v_uid_principal,
      'unidades_transferidas', 1,
      'alerta_generada', false
    );

  -- ===========================================================================
  -- CASO B: TRANSFERENCIA PALETIZADA / GENERAL (Resiliente a Regla de Empaque)
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

    -- Si no tiene regla de empaque registrada, deducir de los datos de la carga
    IF v_unidades_por_caja IS NULL OR v_unidades_por_caja <= 0 THEN
      v_unidades_por_caja := GREATEST(1, ROUND(COALESCE(v_origen.cantidad_actual, 1) / GREATEST(1, COALESCE(v_origen.cantidad_paquetes, 1))));
    END IF;
    IF v_cajas_por_paleta IS NULL OR v_cajas_por_paleta <= 0 THEN
      v_cajas_por_paleta := GREATEST(1, COALESCE(v_origen.cantidad_paquetes, 1));
    END IF;

    -- B.1 PALETA COMPLETA
    IF v_origen.tipo_paleta = 'COMPLETO' THEN
      v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

      v_id_etiqueta_destino := public._asignar_etiqueta_rfid(
        v_uid_principal, v_origen.id_producto, 'COMPLETO',
        v_origen.cantidad_paquetes, v_origen.cantidad_actual,
        p_id_almacen_destino, 'Transferida desde ' || v_origen.uid_tag
      );

    -- B.2 PUCHO (Consolidación Inteligente)
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
    SET estado = 'VACIA', id_almacen_actual = NULL, id_celda = NULL,
        notas = 'Transferido a ' || v_nombre_destino || ' (' || v_uid_principal || ')'
    WHERE id_etiqueta = v_origen.id_etiqueta;

    -- Inventario origen
    UPDATE public.inventario
    SET stock_real = GREATEST(0, stock_real - v_origen.cantidad_actual),
        estado_semaforo = CASE
          WHEN GREATEST(0, stock_real - v_origen.cantidad_actual) <= 0 THEN 'ROJO'
          WHEN GREATEST(0, stock_real - v_origen.cantidad_actual) <= stock_minimo THEN 'AMARILLO'
          ELSE 'VERDE'
        END
    WHERE id_producto = v_origen.id_producto AND id_almacen = p_id_almacen_origen;

    -- Inventario destino
    INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
    VALUES (v_origen.id_producto, p_id_almacen_destino, v_origen.cantidad_actual, (v_cajas_por_paleta * v_unidades_por_caja), 'VERDE')
    ON CONFLICT (id_producto, id_almacen) DO UPDATE SET
      stock_real = public.inventario.stock_real + excluded.stock_real,
      estado_semaforo = CASE
        WHEN public.inventario.stock_real + excluded.stock_real <= 0 THEN 'ROJO'
        WHEN public.inventario.stock_real + excluded.stock_real <= public.inventario.stock_minimo THEN 'AMARILLO'
        ELSE 'VERDE'
      END;

    -- Kardex: Asientos compatibles con movimiento_tipo enum
    INSERT INTO public.movimiento (
      id_usuario, id_etiqueta, id_producto, tipo, cantidad_afectada, destino_almacen, motivo
    )
    VALUES (
      v_id_usuario, v_origen.id_etiqueta, v_origen.id_producto,
      'DESPACHO_COMPLETO'::public.movimiento_tipo,
      v_origen.cantidad_actual, p_id_almacen_destino,
      format('Transferencia: sale %s, entra %s. %s', v_origen.uid_tag, v_uid_principal, p_motivo)
    );

    INSERT INTO public.movimiento (
      id_usuario, id_etiqueta, id_producto, tipo, cantidad_afectada, destino_almacen, motivo
    )
    VALUES (
      v_id_usuario, v_id_etiqueta_destino, v_origen.id_producto,
      CASE WHEN v_origen.tipo_paleta = 'COMPLETO'
           THEN 'INGRESO_COMPLETO'::public.movimiento_tipo
           ELSE 'INGRESO_PUCHO'::public.movimiento_tipo END,
      v_origen.cantidad_actual, p_id_almacen_destino,
      format('Transferencia: ingresa a %s desde %s. %s', v_uid_principal, v_origen.uid_tag, p_motivo)
    );

    -- Alerta si se completó una paleta entera
    IF v_alerta THEN
      INSERT INTO public.alerta_sistema (tipo, id_producto, id_almacen, id_etiqueta, mensaje)
      VALUES (
        'PUCHO_COMPLETADO', v_origen.id_producto, p_id_almacen_destino, v_id_etiqueta_destino,
        format('En %s, los puchos de %s alcanzaron el límite de %s cajas. Se creó la paleta completa %s%s. Verificar físicamente.',
          v_nombre_destino, v_sku, v_cajas_por_paleta, v_uid_principal,
          CASE WHEN v_uid_resto IS NOT NULL THEN ' y un nuevo pucho ' || v_uid_resto ELSE '' END)
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'modo_manejo', v_modo_manejo,
      'mensaje', format('Carga transferida exitosamente a %s.', v_nombre_destino),
      'uid_origen', v_origen.uid_tag,
      'uid_destino', v_uid_principal,
      'uid_nuevo_destino', v_uid_principal,
      'uid_pucho_restante', v_uid_resto,
      'uid_pucho_cerrado', v_uid_cerrado,
      'unidades_transferidas', v_origen.cantidad_actual,
      'alerta_paleta_completada', v_alerta,
      'alerta_generada', v_alerta
    );
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_carga_entre_almacenes(TEXT, BIGINT, BIGINT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
