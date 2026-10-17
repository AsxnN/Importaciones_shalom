-- ==============================================================================
-- MIGRACIÓN: SINCRONIZACIÓN Y CUADRE DE STOCK CONTABLE CON PALETAS FÍSICAS
-- Fecha: 2026-10-14
-- Propósito: Garantizar que cuando las paletas son retiradas o dadas de baja del almacén,
--            el stock contable en 'inventario' se descuente y cuadre 1:1 con la realidad.
-- ==============================================================================

-- 1. Función RPC para Cuadrar el Inventario de un Almacén con sus Paletas Físicas Activas
CREATE OR REPLACE FUNCTION public.sincronizar_stock_con_paletas_almacen(
  p_id_almacen bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_cant_fisica numeric;
  v_cant_anterior numeric;
  v_ajustes integer := 0;
  v_id_usuario bigint;
BEGIN
  -- Validar permisos de administrador u operario
  IF NOT (public.tiene_rol(ARRAY['ADMINISTRADOR', 'OPERARIO'])) THEN
    RAISE EXCEPTION 'Acceso denegado: rol no autorizado para sincronizar inventario.';
  END IF;

  -- Identificar usuario actual
  SELECT id_usuario INTO v_id_usuario
  FROM public.usuario
  WHERE auth_user_id = auth.uid();

  -- Recorrer todos los productos registrados en el almacén
  FOR v_rec IN (
    SELECT id_producto, stock_real, stock_minimo
    FROM public.inventario
    WHERE id_almacen = p_id_almacen
  ) LOOP
    -- Sumar unidades físicas reales activas en etiqueta_rfid para este producto y almacén
    SELECT COALESCE(SUM(COALESCE(cantidad_actual, cantidad_paquetes, 0)), 0)
    INTO v_cant_fisica
    FROM public.etiqueta_rfid
    WHERE id_almacen_actual = p_id_almacen
      AND id_producto = v_rec.id_producto
      AND estado = 'ACTIVA';

    -- Si el stock contable difiere del stock físico real de las paletas, sincronizar
    IF v_cant_fisica != v_rec.stock_real THEN
      v_cant_anterior := v_rec.stock_real;

      -- Actualizar tabla inventario
      UPDATE public.inventario
      SET stock_real = v_cant_fisica,
          estado_semaforo = CASE
            WHEN v_cant_fisica <= 0 THEN 'ROJO'
            WHEN v_cant_fisica <= v_rec.stock_minimo THEN 'AMARILLO'
            ELSE 'VERDE'
          END,
          updated_at = NOW()
      WHERE id_almacen = p_id_almacen
        AND id_producto = v_rec.id_producto;

      -- Registrar movimiento de ajuste en el Kardex inmutable
      INSERT INTO public.movimiento (
        id_usuario,
        id_producto,
        tipo,
        cantidad_afectada,
        destino_almacen,
        motivo
      ) VALUES (
        v_id_usuario,
        v_rec.id_producto,
        'AJUSTE',
        ABS(v_cant_fisica - v_cant_anterior),
        p_id_almacen,
        FORMAT('Cuadre automático con paletas físicas: de %s a %s unidades (diferencia: %s)',
          v_cant_anterior, v_cant_fisica, (v_cant_fisica - v_cant_anterior))
      );

      v_ajustes := v_ajustes + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'mensaje', FORMAT('Inventario cuadrado correctamente. Se ajustaron %s productos.', v_ajustes),
    'productos_ajustados', v_ajustes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_stock_con_paletas_almacen(bigint) TO authenticated;
