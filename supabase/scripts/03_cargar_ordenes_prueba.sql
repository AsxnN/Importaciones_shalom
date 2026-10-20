-- ==============================================================================
-- SCRIPT 3: CARGA DE ÓRDENES DE IMPORTACIÓN DE PRUEBA Y PERMISOS RBAC
-- Proyecto: Importaciones Shalom
-- Propósito: Registra órdenes de importación en estado 'TRANSITO' y 'RECIBIDA'
--            con sus detalles para realizar pruebas de recepción táctica RFID.
-- ==============================================================================

DO $$
DECLARE
  v_id_prov bigint;
  v_id_prod1 bigint;
  v_id_prod2 bigint;
  v_id_prod3 bigint;
  v_id_orden1 bigint;
  v_id_orden2 bigint;
  v_id_orden3 bigint;
BEGIN
  -- 1. Asegurar roles base y vincular usuarios a ADMINISTRADOR
  INSERT INTO public.rol (nombre_rol, descripcion, activo)
  VALUES 
    ('ADMINISTRADOR', 'Administración completa', true),
    ('COMPRADOR', 'Compras y proveedores', true),
    ('OPERARIO', 'Operaciones y RFID', true),
    ('AUDITOR', 'Auditoría e inventario', true)
  ON CONFLICT (nombre_rol) DO UPDATE SET activo = true;

  INSERT INTO public.usuario (auth_user_id, nombre_completo, correo, activo)
  SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), email, true
  FROM auth.users
  ON CONFLICT (auth_user_id) DO UPDATE SET activo = true;

  INSERT INTO public.usuario_rol (id_usuario, id_rol, activo)
  SELECT u.id_usuario, r.id_rol, true
  FROM public.usuario u
  CROSS JOIN public.rol r
  WHERE r.nombre_rol = 'ADMINISTRADOR'
  ON CONFLICT (id_usuario, id_rol) DO UPDATE SET activo = true;

  -- 2. Asegurar proveedor
  INSERT INTO public.proveedor (razon_social, calificacion_otif, tiempo_lead_time_dias, activo)
  VALUES ('Zhejiang Shalom Trading Co., Ltd.', 96.5, 35, true)
  ON CONFLICT (razon_social) DO NOTHING;

  SELECT id_proveedor INTO v_id_prov 
  FROM public.proveedor 
  WHERE razon_social = 'Zhejiang Shalom Trading Co., Ltd.' 
  LIMIT 1;

  -- 3. Obtener IDs de productos maestros
  SELECT id_producto INTO v_id_prod1 FROM public.producto WHERE sku = 'PROD-A01' LIMIT 1;
  SELECT id_producto INTO v_id_prod2 FROM public.producto WHERE sku = 'ROLLO-01' LIMIT 1;
  SELECT id_producto INTO v_id_prod3 FROM public.producto WHERE sku = 'PROD-X99' LIMIT 1;

  -- 4. ORDEN 1: IMP-2026-001 (En Tránsito, 40FT)
  INSERT INTO public.orden_importacion (
    numero_orden, id_proveedor, estado, fecha_emision, tipo_contenedor, volumen_ocupado_m3
  )
  VALUES (
    'IMP-2026-001', v_id_prov, 'TRANSITO', CURRENT_DATE, '40FT', 68.5
  )
  ON CONFLICT (numero_orden) DO UPDATE 
  SET estado = 'TRANSITO', fecha_emision = CURRENT_DATE
  RETURNING id_orden INTO v_id_orden1;

  IF v_id_prod1 IS NOT NULL THEN
    DELETE FROM public.detalle_orden WHERE id_orden = v_id_orden1;
    INSERT INTO public.detalle_orden (id_orden, id_producto, cantidad_pedida, subtotal_peso_kg, subtotal_volumen_m3)
    VALUES (v_id_orden1, v_id_prod1, 5000, 12500, 45.0);
  END IF;

  -- 5. ORDEN 2: IMP-2026-002 (En Tránsito, 20FT)
  INSERT INTO public.orden_importacion (
    numero_orden, id_proveedor, estado, fecha_emision, tipo_contenedor, volumen_ocupado_m3
  )
  VALUES (
    'IMP-2026-002', v_id_prov, 'TRANSITO', CURRENT_DATE - INTERVAL '5 days', '20FT', 31.0
  )
  ON CONFLICT (numero_orden) DO UPDATE 
  SET estado = 'TRANSITO'
  RETURNING id_orden INTO v_id_orden2;

  IF v_id_prod2 IS NOT NULL THEN
    DELETE FROM public.detalle_orden WHERE id_orden = v_id_orden2;
    INSERT INTO public.detalle_orden (id_orden, id_producto, cantidad_pedida, subtotal_peso_kg, subtotal_volumen_m3)
    VALUES (v_id_orden2, v_id_prod2, 2400, 7200, 22.0);
  END IF;

  -- 6. ORDEN 3: IMP-2026-000 (Ya Recibida / Histórica)
  INSERT INTO public.orden_importacion (
    numero_orden, id_proveedor, estado, fecha_emision, tipo_contenedor, volumen_ocupado_m3
  )
  VALUES (
    'IMP-2026-000', v_id_prov, 'RECIBIDA', CURRENT_DATE - INTERVAL '20 days', '40FT', 65.0
  )
  ON CONFLICT (numero_orden) DO UPDATE 
  SET estado = 'RECIBIDA'
  RETURNING id_orden INTO v_id_orden3;

  IF v_id_prod3 IS NOT NULL THEN
    DELETE FROM public.detalle_orden WHERE id_orden = v_id_orden3;
    INSERT INTO public.detalle_orden (id_orden, id_producto, cantidad_pedida, subtotal_peso_kg, subtotal_volumen_m3)
    VALUES (v_id_orden3, v_id_prod3, 1200, 3600, 18.0);
  END IF;

  RAISE NOTICE 'Órdenes de importación cargadas exitosamente (IMP-2026-001, IMP-2026-002, IMP-2026-000)';
END $$;
