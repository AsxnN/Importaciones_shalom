-- ==============================================================================
-- MIGRACIÓN: CORRECCIÓN DE GENERACIÓN DE UID RFID Y TRANSFERENCIAS INTERALMACÉN
-- Fecha: 2026-10-15
-- Propósito:
--   1. Prevenir colisiones de unicidad (etiqueta_rfid_uid_tag_key) en transferencias
--      y generación de códigos RFID.
--   2. Sincronizar secuencia_rfid con el mayor número existente en etiqueta_rfid.
--   3. Hacer transferir_carga_entre_almacenes idempotente y tolerante a colisiones
--      con reactivación limpia (ON CONFLICT DO UPDATE).
-- ==============================================================================

BEGIN;

-- 1. Sincronizar secuencias actuales para cada almacén activo según los tags existentes
INSERT INTO public.secuencia_rfid (id_almacen, ultimo_numero)
SELECT 
  a.id_almacen,
  COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          SUBSTRING(e.uid_tag FROM LENGTH(a.prefijo_rfid) + 1),
          '\D', '', 'g'
        ),
        ''
      )::integer
    ),
    0
  ) AS ultimo_numero
FROM public.almacen a
LEFT JOIN public.etiqueta_rfid e 
  ON e.uid_tag LIKE a.prefijo_rfid || '%'
WHERE a.prefijo_rfid IS NOT NULL
GROUP BY a.id_almacen, a.prefijo_rfid
ON CONFLICT (id_almacen)
DO UPDATE SET ultimo_numero = GREATEST(public.secuencia_rfid.ultimo_numero, EXCLUDED.ultimo_numero);


-- 2. Función mejorada: generar_uid_rfid (Bucle anti-colisión)
CREATE OR REPLACE FUNCTION public.generar_uid_rfid(p_id_almacen bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefijo text;
  v_numero integer;
  v_max_existente integer;
  v_cand text;
  v_existe boolean;
BEGIN
  SELECT a.prefijo_rfid
  INTO v_prefijo
  FROM public.almacen a
  WHERE a.id_almacen = p_id_almacen
    AND a.activo = true;

  IF v_prefijo IS NULL THEN
    RAISE EXCEPTION 'El almacén % no existe, está inactivo o no tiene prefijo RFID.', p_id_almacen;
  END IF;

  -- Asegurar registro en secuencia_rfid inicializado al menos al máximo existente
  SELECT COALESCE(
    MAX(
      NULLIF(
        REGEXP_REPLACE(
          SUBSTRING(uid_tag FROM LENGTH(v_prefijo) + 1),
          '\D', '', 'g'
        ),
        ''
      )::integer
    ),
    0
  ) INTO v_max_existente
  FROM public.etiqueta_rfid
  WHERE uid_tag LIKE v_prefijo || '%';

  INSERT INTO public.secuencia_rfid (id_almacen, ultimo_numero)
  VALUES (p_id_almacen, v_max_existente)
  ON CONFLICT (id_almacen)
  DO UPDATE SET ultimo_numero = GREATEST(public.secuencia_rfid.ultimo_numero, v_max_existente);

  -- Bucle garantizado: incrementa hasta encontrar un código que NO exista en etiqueta_rfid
  LOOP
    UPDATE public.secuencia_rfid
    SET ultimo_numero = ultimo_numero + 1
    WHERE id_almacen = p_id_almacen
    RETURNING ultimo_numero INTO v_numero;

    v_cand := v_prefijo || LPAD(v_numero::text, 5, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.etiqueta_rfid WHERE uid_tag = v_cand
    ) INTO v_existe;

    IF NOT v_existe THEN
      RETURN v_cand;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_uid_rfid(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generar_uid_rfid(bigint) TO authenticated;


-- 3. Función mejorada: transferir_carga_entre_almacenes con ON CONFLICT DO UPDATE
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

  -- CASO 1: PALETA COMPLETA
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
      'Transferida desde ' || v_origen.uid_tag
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

  -- CASO 2: PUCHO (Fusión o Creación)
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

  -- Cerrar etiqueta de origen (queda como historial en estado VACIA)
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
