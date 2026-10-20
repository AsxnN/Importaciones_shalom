-- ==============================================================================
-- SCRIPT 2: CARGA / SIEMBRA DE CATÁLOGO MAESTRO DE PRODUCTOS Y REGLAS DE EMPAQUE
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-17
-- Propósito: Registra las categorías maestras, productos con sus SKUs y sus
--            reglas de empaque oficiales (cajas/camada, camadas/paleta, volumen, etc.)
--            Permite volver a sembrar el catálogo en cualquier momento tras un reset.
-- ==============================================================================

DO $$
DECLARE
  v_cat_ferr BIGINT;
  v_cat_pap BIGINT;
  v_cat_carga BIGINT;
  v_cat_menaje BIGINT;

  v_prod_a01 BIGINT;
  v_prod_rollo01 BIGINT;
  v_prod_x99 BIGINT;
  v_prod_contometro BIGINT;
BEGIN

  -- ----------------------------------------------------------------------------
  -- 1. CATEGORÍAS MAESTRAS
  -- ----------------------------------------------------------------------------
  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Ferretería Industrial', 'Pernos, fijaciones mecánicas y herrajes de alta resistencia', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_ferr;

  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Papelería y Suministros', 'Rollos contómetros térmicos, etiquetas RFID y consumibles POS', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_pap;

  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Carga Pesada / Sobredimensionada', 'Bobinas de cable de acero, maquinaria y bultos de piso libre', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_carga;

  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Menaje y Hogar', 'Artículos de importación para el hogar y bazar comercial', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_menaje;

  -- ----------------------------------------------------------------------------
  -- 2. PROVEEDORES BASE (OPCIONAL)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.proveedor (razon_social, calificacion_otif, tiempo_lead_time_dias, activo)
  VALUES ('Zhejiang Shalom Trading Co., Ltd.', 96.5, 35, true)
  ON CONFLICT (razon_social) DO UPDATE SET calificacion_otif = 96.5, tiempo_lead_time_dias = 35, activo = true;

  -- ----------------------------------------------------------------------------
  -- 3. PRODUCTOS MAESTROS (FICHAS TÉCNICAS)
  -- ----------------------------------------------------------------------------

  -- PRODUCTO 1: PROD-A01
  INSERT INTO public.producto (
    sku, nombre, descripcion, id_categoria, unidad_medida,
    peso_unitario_kg, costo_unitario, clasificacion_abc, activo
  ) VALUES (
    'PROD-A01',
    'Pernos Hexagonales Grado 8 1/2"',
    'Perno de acero al carbono alta resistencia para maquinaria industrial',
    v_cat_ferr,
    'UNID',
    0.120,
    1.80,
    'A',
    true
  )
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    peso_unitario_kg = EXCLUDED.peso_unitario_kg,
    costo_unitario = EXCLUDED.costo_unitario,
    clasificacion_abc = EXCLUDED.clasificacion_abc,
    activo = true
  RETURNING id_producto INTO v_prod_a01;

  -- PRODUCTO 2: ROLLO-01
  INSERT INTO public.producto (
    sku, nombre, descripcion, id_categoria, unidad_medida,
    peso_unitario_kg, costo_unitario, clasificacion_abc, activo
  ) VALUES (
    'ROLLO-01',
    'Rollo Contómetro Térmico 80x80',
    'Papel térmico de alta densidad libre de BPA para terminales POS y tickets',
    v_cat_pap,
    'ROLLO',
    0.250,
    2.50,
    'B',
    true
  )
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    peso_unitario_kg = EXCLUDED.peso_unitario_kg,
    costo_unitario = EXCLUDED.costo_unitario,
    clasificacion_abc = EXCLUDED.clasificacion_abc,
    activo = true
  RETURNING id_producto INTO v_prod_rollo01;

  -- PRODUCTO 3: PROD-X99
  INSERT INTO public.producto (
    sku, nombre, descripcion, id_categoria, unidad_medida,
    peso_unitario_kg, costo_unitario, clasificacion_abc, activo
  ) VALUES (
    'PROD-X99',
    'Bobina Cable de Acero 200m',
    'Bobina reforzada de cable trenzado para elevación y carga en Zona Campo',
    v_cat_carga,
    'BOBINA',
    45.000,
    185.00,
    'A',
    true
  )
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    peso_unitario_kg = EXCLUDED.peso_unitario_kg,
    costo_unitario = EXCLUDED.costo_unitario,
    clasificacion_abc = EXCLUDED.clasificacion_abc,
    activo = true
  RETURNING id_producto INTO v_prod_x99;

  -- PRODUCTO 4: ROLLO-CONTOMETRO-01
  INSERT INTO public.producto (
    sku, nombre, descripcion, id_categoria, unidad_medida,
    peso_unitario_kg, costo_unitario, clasificacion_abc, activo
  ) VALUES (
    'ROLLO-CONTOMETRO-01',
    'Rollo Contómetro Térmico 80x80 (Alta Rotación)',
    'Rollo de papel térmico para POS y emisión continua de comprobantes',
    v_cat_pap,
    'ROLLO',
    0.250,
    2.50,
    'A',
    true
  )
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    peso_unitario_kg = EXCLUDED.peso_unitario_kg,
    costo_unitario = EXCLUDED.costo_unitario,
    clasificacion_abc = EXCLUDED.clasificacion_abc,
    activo = true
  RETURNING id_producto INTO v_prod_contometro;

  -- ----------------------------------------------------------------------------
  -- 4. REGLAS DE EMPAQUE Y ESPECIFICACIONES DE PALETIZADO
  -- ----------------------------------------------------------------------------

  -- Regla PROD-A01: 10 unid/caja, 12 cajas/camada * 4 camadas = 48 cajas/paleta (480 unidades)
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  ) VALUES (
    v_prod_a01, 10, 12, 4,
    12, 4, true, 'Estiba trabada estándar de 4 camadas de 12 cajas sobre paleta 1.20 x 1.00 m',
    30.0, 25.0, 20.0, 5.0, 0.0150, 0.7200
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 10, cajas_por_camada = 12, numero_camadas = 4,
    cajas_por_camita = 12, camitas_por_paleta = 4, permite_puchos = true,
    largo_caja_cm = 30.0, ancho_caja_cm = 25.0, alto_caja_cm = 20.0, peso_caja_kg = 5.0,
    volumen_caja_m3 = 0.0150, volumen_total_m3 = 0.7200;

  -- Regla ROLLO-01: 10 unid/caja, 10 cajas/camada * 3 camadas = 30 cajas/paleta (300 unidades)
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  ) VALUES (
    v_prod_rollo01, 10, 10, 3,
    10, 3, true, 'Estiba compacta en 3 camadas de 10 cajas sobre parihuela',
    35.0, 30.0, 22.0, 6.0, 0.0231, 0.6930
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 10, cajas_por_camada = 10, numero_camadas = 3,
    cajas_por_camita = 10, camitas_por_paleta = 3, permite_puchos = true,
    largo_caja_cm = 35.0, ancho_caja_cm = 30.0, alto_caja_cm = 22.0, peso_caja_kg = 6.0,
    volumen_caja_m3 = 0.0231, volumen_total_m3 = 0.6930;

  -- Regla PROD-X99: 1 bobina/caja, 5 cajas/camada * 2 camadas = 10 bobinas/paleta (10 unidades)
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  ) VALUES (
    v_prod_x99, 1, 5, 2,
    5, 2, true, 'Carga sobredimensionada para Zona Campo / Piso Libre',
    60.0, 60.0, 40.0, 46.0, 0.1440, 1.4400
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 1, cajas_por_camada = 5, numero_camadas = 2,
    cajas_por_camita = 5, camitas_por_paleta = 2, permite_puchos = true,
    largo_caja_cm = 60.0, ancho_caja_cm = 60.0, alto_caja_cm = 40.0, peso_caja_kg = 46.0,
    volumen_caja_m3 = 0.1440, volumen_total_m3 = 1.4400;

  -- Regla ROLLO-CONTOMETRO-01: 10 unid/caja, 30 cajas/paleta = 300 unidades
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  ) VALUES (
    v_prod_contometro, 10, 30, 1,
    30, 1, true, 'Estiba estándar para rollo térmico comercial',
    40.0, 30.0, 25.0, 7.5, 0.0300, 0.9000
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 10, cajas_por_camada = 30, numero_camadas = 1,
    cajas_por_camita = 30, camitas_por_paleta = 1, permite_puchos = true,
    largo_caja_cm = 40.0, ancho_caja_cm = 30.0, alto_caja_cm = 25.0, peso_caja_kg = 7.5,
    volumen_caja_m3 = 0.0300, volumen_total_m3 = 0.9000;

END $$;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN DEL CATÁLOGO SEMBRADO
-- ----------------------------------------------------------------------------
SELECT 
  p.id_producto,
  p.sku,
  p.nombre,
  c.nombre AS categoria,
  p.unidad_medida,
  r.unidades_por_caja,
  (COALESCE(r.cajas_por_camada, r.cajas_por_camita, 1) * COALESCE(r.numero_camadas, r.camitas_por_paleta, 1)) AS cajas_por_paleta,
  (r.unidades_por_caja * COALESCE(r.cajas_por_camada, r.cajas_por_camita, 1) * COALESCE(r.numero_camadas, r.camitas_por_paleta, 1)) AS unidades_por_paleta,
  r.volumen_caja_m3
FROM public.producto p
LEFT JOIN public.categoria c ON c.id_categoria = p.id_categoria
LEFT JOIN public.regla_empaque r ON r.id_producto = p.id_producto
ORDER BY p.id_producto ASC;
