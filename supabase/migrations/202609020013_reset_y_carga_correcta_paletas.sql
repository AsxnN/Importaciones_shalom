-- ==============================================================================
-- SCRIPT SQL: REINICIO COMPLETO Y CARGA LIMPIA DE PALETAS Y UBICACIONES (DINÁMICO)
-- Proyecto: Sistema WMS e Importaciones Shalom
-- Fecha: 2026-10-14
-- Descripción:
--   1. Elimina de forma segura todas las paletas y desvincula referencias históricas.
--   2. Garantiza la existencia de las tablas y políticas de Racks Drive-In y Celdas.
--   3. Inserta/actualiza categorías y productos maestros sin forzar IDs primarios autogenerados.
--   4. Inserta reglas de empaque usando la clave natural id_producto (evita error 23505 en regla_empaque_pkey).
--   5. Configura carriles C01, C02, celdas individuales y Zona Campo (ALM1-CAMPO).
--   6. Enrola 4 paletas reales (Fondo de rack, Medio de rack, Zona Campo y Pucho suelto).
--   7. Cuadra el inventario en 'inventario' 1:1 con las unidades físicas de las paletas.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DESVINCULAR DEPENDENCIAS Y ELIMINAR TODAS LAS PALETAS REGISTRADAS
-- ------------------------------------------------------------------------------

-- 1.1 Limpiar lecturas en auditorías
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_sesion_lectura') THEN
    DELETE FROM public.auditoria_sesion_lectura;
  END IF;
END $$;

-- 1.2 Desvincular id_etiqueta de recepciones y movimientos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recepcion_lectura') THEN
    UPDATE public.recepcion_lectura SET id_etiqueta = NULL WHERE id_etiqueta IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'movimiento') THEN
    UPDATE public.movimiento SET id_etiqueta = NULL WHERE id_etiqueta IS NOT NULL;
  END IF;
END $$;

-- 1.3 Eliminar todas las paletas físicas
DELETE FROM public.etiqueta_rfid;

-- 1.4 Limpiar celdas y carriles anteriores para reconstrucción limpia
DELETE FROM public.celda_rack;
DELETE FROM public.nivel_carril;
DELETE FROM public.carril;


-- ------------------------------------------------------------------------------
-- 2. ASEGURAR TABLAS FÍSICAS Y POLÍTICAS RLS (RACKS, CELDAS, EXTENSIÓN PALETAS)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.carril (
  id_carril bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_almacen bigint NOT NULL REFERENCES public.almacen(id_almacen) ON DELETE CASCADE,
  codigo_carril varchar(50) NOT NULL,
  nombre varchar(100),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_carril_almacen UNIQUE (id_almacen, codigo_carril)
);

CREATE TABLE IF NOT EXISTS public.nivel_carril (
  id_nivel bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_carril bigint NOT NULL REFERENCES public.carril(id_carril) ON DELETE CASCADE,
  numero_nivel integer NOT NULL CHECK (numero_nivel >= 1),
  nombre_nivel varchar(50),
  capacidad_paletas integer NOT NULL DEFAULT 1 CHECK (capacidad_paletas >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_nivel_carril UNIQUE (id_carril, numero_nivel)
);

CREATE TABLE IF NOT EXISTS public.celda_rack (
  id_celda bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_almacen bigint NOT NULL REFERENCES public.almacen(id_almacen) ON DELETE CASCADE,
  tipo_ubicacion varchar(20) NOT NULL DEFAULT 'RACK' CHECK (tipo_ubicacion IN ('RACK', 'CAMPO')),
  id_carril bigint REFERENCES public.carril(id_carril) ON DELETE CASCADE,
  id_nivel bigint REFERENCES public.nivel_carril(id_nivel) ON DELETE CASCADE,
  posicion_fondo integer CHECK (posicion_fondo IS NULL OR posicion_fondo >= 1),
  codigo_ubicacion varchar(100) NOT NULL,
  descripcion varchar(200),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_celda_almacen_codigo UNIQUE (id_almacen, codigo_ubicacion)
);

ALTER TABLE public.etiqueta_rfid 
  ADD COLUMN IF NOT EXISTS id_celda bigint REFERENCES public.celda_rack(id_celda) ON DELETE SET NULL;

ALTER TABLE public.etiqueta_rfid 
  ADD COLUMN IF NOT EXISTS codigo_barras varchar(100);

ALTER TABLE public.etiqueta_rfid 
  ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE public.carril ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nivel_carril ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celda_rack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiqueta_rfid ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carril_lectura_autenticado" ON public.carril;
CREATE POLICY "carril_lectura_autenticado" ON public.carril FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "carril_gestion_autenticado" ON public.carril;
CREATE POLICY "carril_gestion_autenticado" ON public.carril FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "nivel_carril_lectura_autenticado" ON public.nivel_carril;
CREATE POLICY "nivel_carril_lectura_autenticado" ON public.nivel_carril FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "nivel_carril_gestion_autenticado" ON public.nivel_carril;
CREATE POLICY "nivel_carril_gestion_autenticado" ON public.nivel_carril FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "celda_rack_lectura_autenticado" ON public.celda_rack;
CREATE POLICY "celda_rack_lectura_autenticado" ON public.celda_rack FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "celda_rack_gestion_autenticado" ON public.celda_rack;
CREATE POLICY "celda_rack_gestion_autenticado" ON public.celda_rack FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "etiqueta_rfid_lectura_autenticado" ON public.etiqueta_rfid;
CREATE POLICY "etiqueta_rfid_lectura_autenticado" ON public.etiqueta_rfid FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "etiqueta_rfid_gestion_autenticado" ON public.etiqueta_rfid;
CREATE POLICY "etiqueta_rfid_gestion_autenticado" ON public.etiqueta_rfid FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 3. ALMACÉN PRINCIPAL (id = 1)
-- ------------------------------------------------------------------------------
INSERT INTO public.almacen (id_almacen, nombre, tipo, capacidad_m3, activo)
OVERRIDING SYSTEM VALUE
VALUES (1, 'Almacén Principal', 'PRINCIPAL', 500, true)
ON CONFLICT (id_almacen) DO UPDATE SET
  nombre = 'Almacén Principal',
  tipo = 'PRINCIPAL',
  capacidad_m3 = 500,
  activo = true;


-- ------------------------------------------------------------------------------
-- 4. POBLADO DINÁMICO: PRODUCTOS, REGLAS, CARRILES, CELDAS Y PALETAS (SIN CONFLICTOS DE PKEY)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_cat_ferr BIGINT;
  v_cat_pap BIGINT;
  v_cat_carga BIGINT;

  v_prod_a01 BIGINT;
  v_rollo01 BIGINT;
  v_prodx99 BIGINT;

  v_carril1 BIGINT;
  v_carril2 BIGINT;

  v_rec RECORD;
  v_pos INTEGER;
  v_cod_ubi VARCHAR(100);

  v_celda_fondo BIGINT;
  v_celda_medio BIGINT;
  v_celda_campo BIGINT;
BEGIN
  -- 4.1 Categorías (resuelve id dinámicamente)
  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Ferretería Industrial', 'Pernos, tornillería y fijaciones mecánicas', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_ferr;

  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Papelería y Suministros', 'Rollos contómetros, etiquetas y consumibles POS', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_pap;

  INSERT INTO public.categoria (nombre, descripcion, activo)
  VALUES ('Carga Pesada / Sobredimensionada', 'Bobinas de acero, cables y maquinaria de piso', true)
  ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true
  RETURNING id_categoria INTO v_cat_carga;

  -- 4.2 Productos Maestros (resuelve id_producto dinámicamente por SKU)
  INSERT INTO public.producto (sku, nombre, descripcion, id_categoria, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc, activo)
  VALUES ('PROD-A01', 'Pernos Hexagonales Grado 8 1/2"', 'Perno de acero al carbono alta resistencia para maquinaria', v_cat_ferr, 'UNID', 0.120, 1.80, 'A', true)
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    costo_unitario = EXCLUDED.costo_unitario,
    activo = true
  RETURNING id_producto INTO v_prod_a01;

  INSERT INTO public.producto (sku, nombre, descripcion, id_categoria, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc, activo)
  VALUES ('ROLLO-01', 'Rollo Contómetro Térmico 80x80', 'Papel térmico de alta densidad para punto de venta y tickets', v_cat_pap, 'ROLLO', 0.250, 2.50, 'B', true)
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    costo_unitario = EXCLUDED.costo_unitario,
    activo = true
  RETURNING id_producto INTO v_rollo01;

  INSERT INTO public.producto (sku, nombre, descripcion, id_categoria, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc, activo)
  VALUES ('PROD-X99', 'Bobina Cable de Acero 200m', 'Bobina reforzada de cable trenzado para elevación y carga', v_cat_carga, 'BOBINA', 45.000, 185.00, 'A', true)
  ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    id_categoria = EXCLUDED.id_categoria,
    unidad_medida = EXCLUDED.unidad_medida,
    costo_unitario = EXCLUDED.costo_unitario,
    activo = true
  RETURNING id_producto INTO v_prodx99;

  -- 4.3 Reglas de Empaque (SIN forzar id_empaque para evitar error 23505)
  -- PROD-A01: 10 unid/caja, 12 cajas/camada * 4 camadas = 48 cajas/paleta = 480 unid
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  )
  VALUES (
    v_prod_a01, 10, 12, 4, 12, 4, true, 'Estiba trabada estándar de 4 camadas de 12 cajas',
    30.0, 25.0, 20.0, 5.0, 0.0150, 0.7200
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 10, cajas_por_camada = 12, numero_camadas = 4,
    cajas_por_camita = 12, camitas_por_paleta = 4, permite_puchos = true;

  -- ROLLO-01: 10 unid/caja, 10 cajas/camada * 3 camadas = 30 cajas/paleta = 300 unid
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  )
  VALUES (
    v_rollo01, 10, 10, 3, 10, 3, true, 'Estiba compacta en 3 camadas de 10 cajas',
    35.0, 30.0, 22.0, 6.0, 0.0231, 0.6930
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 10, cajas_por_camada = 10, numero_camadas = 3,
    cajas_por_camita = 10, camitas_por_paleta = 3, permite_puchos = true;

  -- PROD-X99: 1 bobina/caja, 5 cajas/camada * 2 camadas = 10 bobinas/paleta
  INSERT INTO public.regla_empaque (
    id_producto, unidades_por_caja, cajas_por_camada, numero_camadas,
    cajas_por_camita, camitas_por_paleta, permite_puchos, notas_armado,
    largo_caja_cm, ancho_caja_cm, alto_caja_cm, peso_caja_kg, volumen_caja_m3, volumen_total_m3
  )
  VALUES (
    v_prodx99, 1, 5, 2, 5, 2, false, 'Bobinas sobredimensionadas pesadas para piso libre',
    50.0, 50.0, 40.0, 45.0, 0.1000, 1.0000
  )
  ON CONFLICT (id_producto) DO UPDATE SET
    unidades_por_caja = 1, cajas_por_camada = 5, numero_camadas = 2,
    cajas_por_camita = 5, camitas_por_paleta = 2, permite_puchos = false;

  -- 4.4 Carriles Drive-In
  INSERT INTO public.carril (id_almacen, codigo_carril, nombre, activo)
  VALUES (1, 'C01', 'Carril 01 (Entrada Principal)', true)
  ON CONFLICT (id_almacen, codigo_carril) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true
  RETURNING id_carril INTO v_carril1;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril1, 1, 'Nivel 1 (Piso)', 5)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 5;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril1, 2, 'Nivel 2 (Medio)', 5)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 5;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril1, 3, 'Nivel 3 (Alto)', 4)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 4;

  INSERT INTO public.carril (id_almacen, codigo_carril, nombre, activo)
  VALUES (1, 'C02', 'Carril 02 (Lateral Asimétrico)', true)
  ON CONFLICT (id_almacen, codigo_carril) DO UPDATE SET nombre = EXCLUDED.nombre, activo = true
  RETURNING id_carril INTO v_carril2;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril2, 1, 'Nivel 1 (Piso)', 5)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 5;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril2, 2, 'Nivel 2 (Medio)', 5)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 5;

  INSERT INTO public.nivel_carril (id_carril, numero_nivel, nombre_nivel, capacidad_paletas)
  VALUES (v_carril2, 3, 'Nivel 3 (Alto)', 4)
  ON CONFLICT (id_carril, numero_nivel) DO UPDATE SET capacidad_paletas = 4;

  -- 4.5 Celda especial Zona Campo (Piso Libre)
  INSERT INTO public.celda_rack (
    id_almacen, tipo_ubicacion, id_carril, id_nivel, posicion_fondo, codigo_ubicacion, descripcion, activo
  )
  VALUES (
    1, 'CAMPO', NULL, NULL, NULL, 'ALM1-CAMPO', 'Zona Piso / Campo para paletas sobredimensionadas', true
  )
  ON CONFLICT (id_almacen, codigo_ubicacion) DO NOTHING;

  -- 4.6 Generación de Celdas individuales de Racks (C01 y C02)
  FOR v_rec IN 
    SELECT c.id_carril, c.codigo_carril, c.nombre AS nombre_carril, n.id_nivel, n.numero_nivel, n.capacidad_paletas
    FROM public.carril c
    JOIN public.nivel_carril n ON n.id_carril = c.id_carril
    WHERE c.id_almacen = 1
  LOOP
    FOR v_pos IN 1..v_rec.capacidad_paletas LOOP
      v_cod_ubi := v_rec.codigo_carril || '-N' || LPAD(v_rec.numero_nivel::text, 2, '0') || '-P' || LPAD(v_pos::text, 2, '0');
      INSERT INTO public.celda_rack (
        id_almacen, tipo_ubicacion, id_carril, id_nivel, posicion_fondo, codigo_ubicacion, descripcion, activo
      )
      VALUES (
        1, 'RACK', v_rec.id_carril, v_rec.id_nivel, v_pos, v_cod_ubi,
        v_rec.nombre_carril || ' · Nivel ' || v_rec.numero_nivel || ' · Posición Fondo ' || v_pos, true
      )
      ON CONFLICT (id_almacen, codigo_ubicacion) DO UPDATE SET
        tipo_ubicacion = 'RACK',
        id_carril = EXCLUDED.id_carril,
        id_nivel = EXCLUDED.id_nivel,
        posicion_fondo = EXCLUDED.posicion_fondo,
        activo = true;
    END LOOP;
  END LOOP;

  -- 4.7 Obtener IDs de celdas para ubicar paletas
  SELECT id_celda INTO v_celda_fondo FROM public.celda_rack WHERE id_almacen = 1 AND codigo_ubicacion = 'C01-N01-P01';
  SELECT id_celda INTO v_celda_medio FROM public.celda_rack WHERE id_almacen = 1 AND codigo_ubicacion = 'C01-N01-P02';
  SELECT id_celda INTO v_celda_campo FROM public.celda_rack WHERE id_almacen = 1 AND codigo_ubicacion = 'ALM1-CAMPO';

  -- 4.8 Insertar Paletas Reales (etiqueta_rfid sin forzar id_etiqueta)
  -- Paleta 1: Pernos en Fondo de Rack (C01-N01-P01) -> 48 cajas = 480 unidades
  INSERT INTO public.etiqueta_rfid (
    uid_tag, codigo_barras, id_producto, id_almacen_actual, id_celda,
    tipo_paleta, cantidad_paquetes, cantidad_actual, estado, notas
  )
  VALUES (
    'E28011606000021A98765401', 'PAL-001', v_prod_a01, 1, v_celda_fondo,
    'COMPLETO'::public.tipo_paleta, 48, 480, 'ACTIVA', 'Paleta completa ubicada en el fondo del carril 1'
  )
  ON CONFLICT (uid_tag) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    id_producto = EXCLUDED.id_producto,
    id_almacen_actual = EXCLUDED.id_almacen_actual,
    id_celda = EXCLUDED.id_celda,
    tipo_paleta = EXCLUDED.tipo_paleta,
    cantidad_paquetes = EXCLUDED.cantidad_paquetes,
    cantidad_actual = EXCLUDED.cantidad_actual,
    estado = 'ACTIVA',
    notas = EXCLUDED.notas;

  -- Paleta 2: Pernos en Posición Media de Rack (C01-N01-P02) -> 48 cajas = 480 unidades
  INSERT INTO public.etiqueta_rfid (
    uid_tag, codigo_barras, id_producto, id_almacen_actual, id_celda,
    tipo_paleta, cantidad_paquetes, cantidad_actual, estado, notas
  )
  VALUES (
    'E28011606000021A98765402', 'PAL-002', v_prod_a01, 1, v_celda_medio,
    'COMPLETO'::public.tipo_paleta, 48, 480, 'ACTIVA', 'Paleta completa ubicada en la segunda posición'
  )
  ON CONFLICT (uid_tag) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    id_producto = EXCLUDED.id_producto,
    id_almacen_actual = EXCLUDED.id_almacen_actual,
    id_celda = EXCLUDED.id_celda,
    tipo_paleta = EXCLUDED.tipo_paleta,
    cantidad_paquetes = EXCLUDED.cantidad_paquetes,
    cantidad_actual = EXCLUDED.cantidad_actual,
    estado = 'ACTIVA',
    notas = EXCLUDED.notas;

  -- Paleta 3: Bobinas de Acero en Zona Campo (ALM1-CAMPO) -> 10 bobinas = 10 unidades
  INSERT INTO public.etiqueta_rfid (
    uid_tag, codigo_barras, id_producto, id_almacen_actual, id_celda,
    tipo_paleta, cantidad_paquetes, cantidad_actual, estado, notas
  )
  VALUES (
    'E28011606000021A98765403', 'PAL-003', v_prodx99, 1, v_celda_campo,
    'COMPLETO'::public.tipo_paleta, 10, 10, 'ACTIVA', 'Carga sobredimensionada almacenada en Zona Campo / Piso Libre'
  )
  ON CONFLICT (uid_tag) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    id_producto = EXCLUDED.id_producto,
    id_almacen_actual = EXCLUDED.id_almacen_actual,
    id_celda = EXCLUDED.id_celda,
    tipo_paleta = EXCLUDED.tipo_paleta,
    cantidad_paquetes = EXCLUDED.cantidad_paquetes,
    cantidad_actual = EXCLUDED.cantidad_actual,
    estado = 'ACTIVA',
    notas = EXCLUDED.notas;

  -- Paleta 4: Pucho Suelto de Rollo Contómetro (Sin celda asignada) -> 8 cajas = 80 unidades
  INSERT INTO public.etiqueta_rfid (
    uid_tag, codigo_barras, id_producto, id_almacen_actual, id_celda,
    tipo_paleta, cantidad_paquetes, cantidad_actual, estado, notas
  )
  VALUES (
    'E28011606000021A98765404', 'PAL-004', v_rollo01, 1, NULL,
    'PUCHO'::public.tipo_paleta, 8, 80, 'ACTIVA', 'Cajas sueltas pucho pendientes de estibar'
  )
  ON CONFLICT (uid_tag) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    id_producto = EXCLUDED.id_producto,
    id_almacen_actual = EXCLUDED.id_almacen_actual,
    id_celda = EXCLUDED.id_celda,
    tipo_paleta = EXCLUDED.tipo_paleta,
    cantidad_paquetes = EXCLUDED.cantidad_paquetes,
    cantidad_actual = EXCLUDED.cantidad_actual,
    estado = 'ACTIVA',
    notas = EXCLUDED.notas;

  -- 4.9 Sincronizar Inventario Cuadrado 1:1 con las Paletas
  INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
  VALUES (v_prod_a01, 1, 960, 200, 'VERDE')
  ON CONFLICT (id_producto, id_almacen) DO UPDATE SET stock_real = 960, stock_minimo = 200, estado_semaforo = 'VERDE';

  INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
  VALUES (v_rollo01, 1, 80, 100, 'AMARILLO')
  ON CONFLICT (id_producto, id_almacen) DO UPDATE SET stock_real = 80, stock_minimo = 100, estado_semaforo = 'AMARILLO';

  INSERT INTO public.inventario (id_producto, id_almacen, stock_real, stock_minimo, estado_semaforo)
  VALUES (v_prodx99, 1, 10, 5, 'VERDE')
  ON CONFLICT (id_producto, id_almacen) DO UPDATE SET stock_real = 10, stock_minimo = 5, estado_semaforo = 'VERDE';

END $$;

COMMIT;
