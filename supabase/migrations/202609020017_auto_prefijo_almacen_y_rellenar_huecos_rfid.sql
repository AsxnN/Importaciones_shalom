-- ==============================================================================
-- MIGRACIÓN: AUTO-PREFIJO DE ALMACÉN (3 LETRAS) Y RELLENADO DE HUECOS RFID
-- Fecha: 2026-10-15
-- Propósito:
--   1. Generar automáticamente el prefijo RFID oficial (3 primeras letras de
--      cada palabra del nombre del almacén) al crear o actualizar almacenes.
--   2. Modificar generar_uid_rfid para buscar de menor a mayor (1, 2, 3...)
--      qué huecos hay libres (etiquetas que no existan o que estén en estado VACIA),
--      asignando siempre el menor código disponible.
--   3. Actualizar transferir_carga_entre_almacenes para reactivar o insertar
--      utilizando el menor hueco libre.
-- ==============================================================================

BEGIN;

-- 1. FUNCIÓN Y TRIGGER PARA AUTO-GENERAR PREFIJO RFID DE 3 LETRAS POR PALABRA
CREATE OR REPLACE FUNCTION public.fn_auto_prefijo_almacen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pref text;
  v_candidato text;
  v_suffix integer := 1;
BEGIN
  -- Si no se proporcionó prefijo, generarlo con las 3 primeras letras de cada palabra del nombre
  IF NEW.prefijo_rfid IS NULL OR TRIM(NEW.prefijo_rfid) = '' THEN
    SELECT string_agg(upper(left(w, 3)), '')
    INTO v_pref
    FROM regexp_split_to_table(
      regexp_replace(
        translate(NEW.nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'),
        '[^A-Za-z0-9 ]', '', 'g'
      ),
      '\s+'
    ) AS w
    WHERE w <> '';

    IF v_pref IS NULL OR v_pref = '' THEN
      v_pref := 'ALM';
    END IF;

    v_candidato := v_pref;

    -- Asegurar unicidad si ya existe otro almacén con el mismo prefijo
    WHILE EXISTS (
      SELECT 1 FROM public.almacen 
      WHERE prefijo_rfid = v_candidato 
        AND id_almacen <> COALESCE(NEW.id_almacen, 0)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidato := v_pref || v_suffix::text;
    END LOOP;

    NEW.prefijo_rfid := v_candidato;
  ELSE
    NEW.prefijo_rfid := UPPER(TRIM(NEW.prefijo_rfid));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_almacen_auto_prefijo ON public.almacen;
CREATE TRIGGER trg_almacen_auto_prefijo
BEFORE INSERT OR UPDATE ON public.almacen
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_prefijo_almacen();

-- Auto-completar prefijos vacíos o nulos en almacenes existentes
UPDATE public.almacen
SET prefijo_rfid = NULL
WHERE prefijo_rfid IS NULL OR TRIM(prefijo_rfid) = '';


-- 2. GENERAR UID RFID RELLENANDO HUECOS LIBRES DE MENOR A MAYOR
CREATE OR REPLACE FUNCTION public.generar_uid_rfid(p_id_almacen bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefijo text;
  v_numero integer := 1;
  v_cand text;
  v_ocupado boolean;
BEGIN
  SELECT a.prefijo_rfid
  INTO v_prefijo
  FROM public.almacen a
  WHERE a.id_almacen = p_id_almacen
    AND a.activo = true;

  IF v_prefijo IS NULL OR TRIM(v_prefijo) = '' THEN
    RAISE EXCEPTION 'El almacén % no existe, está inactivo o no tiene prefijo RFID.', p_id_almacen;
  END IF;

  -- Bucle de menor a mayor: buscar el primer número que NO esté activo
  LOOP
    v_cand := v_prefijo || LPAD(v_numero::text, 5, '0');

    -- Solo está ocupada si existe en etiqueta_rfid y su estado es 'ACTIVA'
    SELECT EXISTS (
      SELECT 1 
      FROM public.etiqueta_rfid 
      WHERE uid_tag = v_cand AND estado = 'ACTIVA'
    ) INTO v_ocupado;

    IF NOT v_ocupado THEN
      -- Hueco libre encontrado (ya sea que exista como VACIA o que no exista)
      INSERT INTO public.secuencia_rfid (id_almacen, ultimo_numero)
      VALUES (p_id_almacen, v_numero)
      ON CONFLICT (id_almacen)
      DO UPDATE SET ultimo_numero = GREATEST(public.secuencia_rfid.ultimo_numero, v_numero);

      RETURN v_cand;
    END IF;

    v_numero := v_numero + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_uid_rfid(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generar_uid_rfid(bigint) TO authenticated;


-- 3. ACTUALIZAR transferir_carga_entre_almacenes CON RESOLUCIÓN DE HUECOS
CREATE OR REPLACE FUNCTION public.transferir_carga_entre_almacenes(
  p_uid_origen text,
  p_id_almacen_origen bigint,
  p_id_almacen_destino bigint,
  p_motivo text DEFAULT 'Transferencia entre almacenes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_usuario bigint;
  v_origen public.etiqueta_rfid%ROWTYPE;
  v_pucho_dest public.etiqueta_rfid%ROWTYPE;
  v_hay_pucho_dest boolean := false;

  v_sku text;
  v_nombre_destino text;
  v_unidades_por_caja integer;
  v_cajas_por_paleta integer;

  v_total_cajas integer;
  v_resto integer;

  v_uid_principal text;
  v_uid_resto text;
  v_uid_cerrado text;
  v_id_etiqueta_destino bigint;
  v_id_etiqueta_resto bigint;
  v_alerta boolean := false;
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

  -- Bloquear y validar la etiqueta origen
  SELECT * INTO v_origen
  FROM public.etiqueta_rfid
  WHERE uid_tag = TRIM(p_uid_origen)
    AND id_almacen_actual = p_id_almacen_origen
    AND estado = 'ACTIVA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La etiqueta % no está activa en el almacén origen.', p_uid_origen;
  END IF;

  IF v_origen.cantidad_actual <= 0 OR v_origen.cantidad_paquetes <= 0 THEN
    RAISE EXCEPTION 'La etiqueta % no tiene cantidad para transferir.', p_uid_origen;
  END IF;

  SELECT p.sku INTO v_sku
  FROM public.producto p
  WHERE p.id_producto = v_origen.id_producto;

  SELECT 
    COALESCE(re.unidades_por_caja, 1),
    COALESCE(re.cajas_por_camada * re.numero_camadas, re.cajas_por_camita * re.camitas_por_paleta, 1)
  INTO v_unidades_por_caja, v_cajas_por_paleta
  FROM public.regla_empaque re
  WHERE re.id_producto = v_origen.id_producto;

  IF NOT FOUND OR v_unidades_por_caja <= 0 OR v_cajas_por_paleta <= 0 THEN
    v_unidades_por_caja := 1;
    v_cajas_por_paleta := GREATEST(v_origen.cantidad_paquetes, 1);
  END IF;

  -- CASO 1: PALETA COMPLETA (Asignar el menor hueco libre en destino)
  IF v_origen.tipo_paleta = 'COMPLETO' THEN

    v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

    INSERT INTO public.etiqueta_rfid (
      uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
      cantidad_actual, estado, id_almacen_actual, notas
    )
    VALUES (
      v_uid_principal, v_origen.id_producto, 'COMPLETO',
      v_origen.cantidad_paquetes, v_origen.cantidad_actual,
      'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
      'Transferida desde ' || v_origen.uid_tag || ' (hueco completado)'
    )
    ON CONFLICT (uid_tag)
    DO UPDATE SET
      id_producto = EXCLUDED.id_producto,
      tipo_paleta = EXCLUDED.tipo_paleta,
      cantidad_paquetes = EXCLUDED.cantidad_paquetes,
      cantidad_actual = EXCLUDED.cantidad_actual,
      estado = 'ACTIVA'::public.etiqueta_estado,
      id_almacen_actual = EXCLUDED.id_almacen_actual,
      id_celda = NULL,
      notas = EXCLUDED.notas
    RETURNING id_etiqueta INTO v_id_etiqueta_destino;

  -- CASO 2: PUCHO (Fusión o Creación en hueco libre)
  ELSE

    SELECT * INTO v_pucho_dest
    FROM public.etiqueta_rfid
    WHERE id_producto = v_origen.id_producto
      AND id_almacen_actual = p_id_almacen_destino
      AND tipo_paleta = 'PUCHO'
      AND estado = 'ACTIVA'
    FOR UPDATE;

    v_hay_pucho_dest := FOUND;

    v_total_cajas := v_origen.cantidad_paquetes
      + CASE WHEN v_hay_pucho_dest THEN v_pucho_dest.cantidad_paquetes ELSE 0 END;

    IF v_total_cajas < v_cajas_por_paleta THEN

      IF v_hay_pucho_dest THEN
        UPDATE public.etiqueta_rfid
        SET cantidad_paquetes = v_total_cajas,
            cantidad_actual = v_total_cajas * v_unidades_por_caja,
            notas = 'Pucho consolidado (+ ' || v_origen.cantidad_paquetes || ' cajas de ' || v_origen.uid_tag || ')'
        WHERE id_etiqueta = v_pucho_dest.id_etiqueta;

        v_uid_principal := v_pucho_dest.uid_tag;
        v_id_etiqueta_destino := v_pucho_dest.id_etiqueta;
      ELSE
        v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

        INSERT INTO public.etiqueta_rfid (
          uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
          cantidad_actual, estado, id_almacen_actual, notas
        )
        VALUES (
          v_uid_principal, v_origen.id_producto, 'PUCHO',
          v_origen.cantidad_paquetes, v_origen.cantidad_actual,
          'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
          'Pucho transferido desde ' || v_origen.uid_tag
        )
        ON CONFLICT (uid_tag)
        DO UPDATE SET
          id_producto = EXCLUDED.id_producto,
          tipo_paleta = EXCLUDED.tipo_paleta,
          cantidad_paquetes = EXCLUDED.cantidad_paquetes,
          cantidad_actual = EXCLUDED.cantidad_actual,
          estado = 'ACTIVA'::public.etiqueta_estado,
          id_almacen_actual = EXCLUDED.id_almacen_actual,
          id_celda = NULL,
          notas = EXCLUDED.notas
        RETURNING id_etiqueta INTO v_id_etiqueta_destino;
      END IF;

    ELSE
      -- Límite alcanzado: completa una paleta entera
      IF v_hay_pucho_dest THEN
        v_uid_cerrado := v_pucho_dest.uid_tag;

        UPDATE public.etiqueta_rfid
        SET estado = 'VACIA',
            cantidad_paquetes = 0,
            cantidad_actual = 0,
            id_almacen_actual = NULL,
            id_celda = NULL,
            notas = TRIM(COALESCE(notas, '') || ' Consolidado en paleta completa')
        WHERE id_etiqueta = v_pucho_dest.id_etiqueta;
      END IF;

      v_uid_principal := public.generar_uid_rfid(p_id_almacen_destino);

      INSERT INTO public.etiqueta_rfid (
        uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
        cantidad_actual, estado, id_almacen_actual, notas
      )
      VALUES (
        v_uid_principal, v_origen.id_producto, 'COMPLETO',
        v_cajas_por_paleta, v_cajas_por_paleta * v_unidades_por_caja,
        'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
        'Paleta completa formada al consolidar puchos'
      )
      ON CONFLICT (uid_tag)
      DO UPDATE SET
        id_producto = EXCLUDED.id_producto,
        tipo_paleta = EXCLUDED.tipo_paleta,
        cantidad_paquetes = EXCLUDED.cantidad_paquetes,
        cantidad_actual = EXCLUDED.cantidad_actual,
        estado = 'ACTIVA'::public.etiqueta_estado,
        id_almacen_actual = EXCLUDED.id_almacen_actual,
        id_celda = NULL,
        notas = EXCLUDED.notas
      RETURNING id_etiqueta INTO v_id_etiqueta_destino;

      v_resto := v_total_cajas - v_cajas_por_paleta;

      IF v_resto > 0 THEN
        v_uid_resto := public.generar_uid_rfid(p_id_almacen_destino);

        INSERT INTO public.etiqueta_rfid (
          uid_tag, id_producto, tipo_paleta, cantidad_paquetes,
          cantidad_actual, estado, id_almacen_actual, notas
        )
        VALUES (
          v_uid_resto, v_origen.id_producto, 'PUCHO',
          v_resto, v_resto * v_unidades_por_caja,
          'ACTIVA'::public.etiqueta_estado, p_id_almacen_destino,
          'Remanente tras formar paleta completa ' || v_uid_principal
        )
        ON CONFLICT (uid_tag)
        DO UPDATE SET
          id_producto = EXCLUDED.id_producto,
          tipo_paleta = EXCLUDED.tipo_paleta,
          cantidad_paquetes = EXCLUDED.cantidad_paquetes,
          cantidad_actual = EXCLUDED.cantidad_actual,
          estado = 'ACTIVA'::public.etiqueta_estado,
          id_almacen_actual = EXCLUDED.id_almacen_actual,
          id_celda = NULL,
          notas = EXCLUDED.notas
        RETURNING id_etiqueta INTO v_id_etiqueta_resto;
      END IF;

      INSERT INTO public.alerta_sistema (
        tipo, id_almacen, id_producto, id_etiqueta, mensaje
      )
      VALUES (
        'PUCHO_COMPLETADO',
        p_id_almacen_destino,
        v_origen.id_producto,
        v_id_etiqueta_destino,
        FORMAT(
          'En %s, los puchos de %s alcanzaron el límite de %s cajas. Se creó la paleta completa %s%s. Verificar físicamente.',
          v_nombre_destino, v_sku, v_cajas_por_paleta, v_uid_principal,
          CASE WHEN v_uid_resto IS NOT NULL THEN ' y un nuevo pucho ' || v_uid_resto ELSE '' END
        )
      );

      v_alerta := true;
    END IF;

  END IF;

  -- Cerrar etiqueta de origen: pasa a estado VACIA (queda libre para rellenar en origen)
  UPDATE public.etiqueta_rfid
  SET estado = 'VACIA',
      cantidad_paquetes = 0,
      cantidad_actual = 0,
      id_almacen_actual = NULL,
      id_celda = NULL,
      notas = TRIM(COALESCE(notas, '') || ' Transferida a ' || v_uid_principal)
  WHERE id_etiqueta = v_origen.id_etiqueta;

  -- Kardex: salida del almacén origen
  INSERT INTO public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  VALUES (
    v_id_usuario, v_origen.id_etiqueta, v_origen.id_producto,
    'DESPACHO_COMPLETO'::public.movimiento_tipo,
    v_origen.cantidad_actual, p_id_almacen_destino,
    FORMAT('Transferencia: sale %s, entra %s. %s', v_origen.uid_tag, v_uid_principal, p_motivo)
  );

  -- Kardex: ingreso al almacén destino
  INSERT INTO public.movimiento (
    id_usuario, id_etiqueta, id_producto, tipo,
    cantidad_afectada, destino_almacen, motivo
  )
  VALUES (
    v_id_usuario, v_id_etiqueta_destino, v_origen.id_producto,
    CASE WHEN v_origen.tipo_paleta = 'COMPLETO'
         THEN 'INGRESO_COMPLETO'::public.movimiento_tipo
         ELSE 'INGRESO_PUCHO'::public.movimiento_tipo END,
    v_origen.cantidad_actual, p_id_almacen_destino,
    FORMAT('Transferencia: ingresa a %s desde %s. %s', v_uid_principal, v_origen.uid_tag, p_motivo)
  );

  -- Inventario origen: Descontar stock
  UPDATE public.inventario
  SET stock_real = GREATEST(0, stock_real - v_origen.cantidad_actual),
      estado_semaforo = CASE
        WHEN GREATEST(0, stock_real - v_origen.cantidad_actual) <= 0 THEN 'ROJO'
        WHEN GREATEST(0, stock_real - v_origen.cantidad_actual) <= stock_minimo THEN 'AMARILLO'
        ELSE 'VERDE'
      END,
      updated_at = NOW()
  WHERE id_producto = v_origen.id_producto
    AND id_almacen = p_id_almacen_origen;

  -- Inventario destino: Incrementar stock
  INSERT INTO public.inventario (
    id_producto, id_almacen, stock_real, stock_minimo,
    consumo_abs, estado_semaforo
  )
  VALUES (
    v_origen.id_producto, p_id_almacen_destino,
    v_origen.cantidad_actual, 0, 0, 'VERDE'
  )
  ON CONFLICT (id_producto, id_almacen)
  DO UPDATE SET
    stock_real = public.inventario.stock_real + EXCLUDED.stock_real,
    estado_semaforo = CASE
      WHEN public.inventario.stock_real + EXCLUDED.stock_real <= 0 THEN 'ROJO'
      WHEN public.inventario.stock_real + EXCLUDED.stock_real <= public.inventario.stock_minimo THEN 'AMARILLO'
      ELSE 'VERDE'
    END,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'ok', true,
    'uid_origen', v_origen.uid_tag,
    'uid_destino', v_uid_principal,
    'uid_pucho_restante', v_uid_resto,
    'uid_pucho_cerrado', v_uid_cerrado,
    'alerta_generada', v_alerta,
    'unidades_transferidas', v_origen.cantidad_actual,
    'mensaje', CASE
      WHEN v_alerta THEN 'Transferencia registrada. Se completó una paleta entera y se generó alerta de verificación física.'
      ELSE 'Transferencia entre almacenes registrada exitosamente.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_carga_entre_almacenes(text, bigint, bigint, text) TO authenticated;

COMMIT;
