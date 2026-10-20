-- ==============================================================================
-- Migración: Módulo 06 - Órdenes y Proyecciones Dinámicas de Importación
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-20
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.plantilla_proyeccion (
  id_plantilla bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo varchar NOT NULL UNIQUE,
  nombre varchar NOT NULL,
  descripcion text,
  lead_time_meses numeric NOT NULL DEFAULT 3,
  seguridad_pct numeric NOT NULL DEFAULT 0.20,
  factor_compra numeric NOT NULL DEFAULT 2,
  dias_por_mes integer NOT NULL DEFAULT 30,
  formula_stock_min varchar NOT NULL DEFAULT 'PROM_MEN * lead_time_meses',
  formula_seguridad varchar NOT NULL DEFAULT 'stock_min * seguridad_pct',
  formula_stock_min_f varchar NOT NULL DEFAULT 'stock_min + seguridad',
  formula_compra varchar NOT NULL DEFAULT 'stock_redondeado * factor_compra',
  formula_meses_duracion varchar NOT NULL DEFAULT 'stock_real / (PROM_MEN > 0 ? PROM_MEN : 1)',
  columnas_meses text[] NOT NULL DEFAULT ARRAY['SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL'],
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_proyeccion (
  id_item bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_plantilla bigint NOT NULL REFERENCES public.plantilla_proyeccion(id_plantilla) ON DELETE CASCADE,
  id_producto bigint REFERENCES public.producto(id_producto) ON DELETE SET NULL,
  nombre_producto varchar NOT NULL,
  datos_meses jsonb NOT NULL DEFAULT '{}'::jsonb,
  promedio_manual numeric,
  stock_manual numeric,
  stock_redondeado_manual numeric,
  orden_fila integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plantilla_proyeccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_proyeccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plantilla_proyeccion_lectura" ON public.plantilla_proyeccion;
CREATE POLICY "plantilla_proyeccion_lectura" ON public.plantilla_proyeccion
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "plantilla_proyeccion_gestion" ON public.plantilla_proyeccion;
CREATE POLICY "plantilla_proyeccion_gestion" ON public.plantilla_proyeccion
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']));

DROP POLICY IF EXISTS "item_proyeccion_lectura" ON public.item_proyeccion;
CREATE POLICY "item_proyeccion_lectura" ON public.item_proyeccion
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "item_proyeccion_gestion" ON public.item_proyeccion;
CREATE POLICY "item_proyeccion_gestion" ON public.item_proyeccion
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']));

-- 1. Plantilla IMP_STO
INSERT INTO public.plantilla_proyeccion (
  codigo, nombre, descripcion, lead_time_meses, seguridad_pct, factor_compra, columnas_meses, activo
) VALUES (
  'IMP_STO',
  'Importaciones y Store',
  'Modelo dinámico de proyección para suministros de embalaje y paquetería de agencias',
  3,
  0.20,
  2,
  ARRAY['SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL'],
  true
)
ON CONFLICT (codigo) DO UPDATE
SET lead_time_meses = EXCLUDED.lead_time_meses,
    seguridad_pct = EXCLUDED.seguridad_pct,
    factor_compra = EXCLUDED.factor_compra,
    columnas_meses = EXCLUDED.columnas_meses,
    activo = true;

-- 2. Plantilla CONST
INSERT INTO public.plantilla_proyeccion (
  codigo, nombre, descripcion, lead_time_meses, seguridad_pct, factor_compra, columnas_meses, activo
) VALUES (
  'CONST',
  'Construcción y Mantenimiento',
  'Modelo de reposición para insumos de infraestructura, luminarias y cerámicos',
  2,
  0.10,
  2,
  ARRAY[]::text[],
  true
)
ON CONFLICT (codigo) DO UPDATE
SET lead_time_meses = EXCLUDED.lead_time_meses,
    seguridad_pct = EXCLUDED.seguridad_pct,
    factor_compra = EXCLUDED.factor_compra,
    activo = true;


DELETE FROM public.item_proyeccion WHERE id_plantilla IN (
  SELECT id_plantilla FROM public.plantilla_proyeccion WHERE codigo IN ('IMP_STO', 'CONST')
);

INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'BOLSA SEG. GRANDE', '{"SEP": -22400.0, "OCT": -2200.0, "NOV": -18400.0, "DIC": -14800.0, "ENE": -16200.0, "FEB": -15000.0, "MAR": -89600.0, "ABR": -22000.0, "MAY": -12500.0, "JUN": -2500.0, "JUL": -16000.0}'::jsonb, 15000, 48500, 60000, 1
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'BOLSA SEG. MEDIANA', '{"SEP": 0.0, "OCT": 0.0, "NOV": -3800.0, "DIC": -16200.0, "ENE": -7400.0, "FEB": -300.0, "MAR": -10000.0, "ABR": 0.0, "MAY": 0.0, "JUN": -5000.0, "JUL": 0.0}'::jsonb, 5000, 193000, 40000, 2
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'BOLSA SEG. PEQUEÑO', '{"SEP": -11000.0, "OCT": -14800.0, "NOV": -11100.0, "DIC": -13600.0, "ENE": -10200.0, "FEB": -10200.0, "MAR": -6800.0, "ABR": 0.0, "MAY": 0.0, "JUN": -10000.0, "JUL": -8000.0}'::jsonb, 10000, 141500, 40000, 3
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'BURBUPACK- 50 CM', '{"SEP": -2106.0, "OCT": -2610.0, "NOV": -2800.0, "DIC": -2401.0, "ENE": -2300.0, "FEB": -2000.0, "MAR": -2220.0, "ABR": -3600.0, "MAY": -2400.0, "JUN": -300.0, "JUL": -350.0}'::jsonb, 3000, 30000, 15000, 4
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CINTAS-EMBALAJE 2 X 100 YDS', '{"SEP": -864.0, "OCT": -1152.0, "NOV": -1800.0, "DIC": -1008.0, "ENE": -936.0, "FEB": -792.0, "MAR": -1080.0, "ABR": -2592.0, "MAY": -4824.0, "JUN": 0.0, "JUL": 0.0}'::jsonb, 1200, 2584, 4000, 5
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CINTAS-EMBALAJE 2 X 50 YDS', '{"SEP": 0.0, "OCT": 0.0, "NOV": 0.0, "DIC": 0.0, "ENE": 0.0, "FEB": 0.0, "MAR": -8220.0, "ABR": 0.0, "MAY": 0.0, "JUN": 0.0, "JUL": 0.0}'::jsonb, 12000, 80000, 40000, 6
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CONTOMETRO', '{"SEP": -14505.0, "OCT": -17100.0, "NOV": -19200.0, "DIC": -26850.0, "ENE": -21300.0, "FEB": -17400.0, "MAR": -21750.0, "ABR": -25200.0, "MAY": -600.0, "JUN": 0.0, "JUL": -22000.0}'::jsonb, 22000, 98000, 90000, 7
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PAQUETE S', '{"SEP": -9784.0, "OCT": -10375.0, "NOV": -11304.0, "DIC": -10925.0, "ENE": -13971.0, "FEB": -14482.0, "MAR": -14860.0, "ABR": -17880.0, "MAY": -15400.0, "JUN": -2800.0, "JUL": -13180.0}'::jsonb, 15000, 101820, 60000, 8
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PAQUETE XS', '{"SEP": -15083.0, "OCT": -16523.0, "NOV": -9625.0, "DIC": -23439.0, "ENE": -22876.0, "FEB": -17770.0, "MAR": -26200.0, "ABR": -18920.0, "MAY": 0.0, "JUN": -30.0, "JUL": 0.0}'::jsonb, 15000, 229000, 60000, 9
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PAQUETE XXS', '{"SEP": -44666.0, "OCT": -30050.0, "NOV": -58957.0, "DIC": -45007.0, "ENE": -44646.0, "FEB": -45442.0, "MAR": -40000.0, "ABR": -14800.0, "MAY": -39860.0, "JUN": -24800.0, "JUL": -44900.0}'::jsonb, 35000, 151067, 130000, 10
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PRECINTO-PQT 100 UND-20 CM', '{"SEP": 0, "OCT": 0, "NOV": 0, "DIC": 0, "ENE": 0, "FEB": 0, "MAR": 0, "ABR": -1800.0, "MAY": 0.0, "JUN": 0.0, "JUL": 0.0}'::jsonb, 450, 500000, 250000, 11
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PRECINTO-PQT 100 UND-30 CM', '{"SEP": 0, "OCT": 0, "NOV": 0, "DIC": 0, "ENE": 0, "FEB": 0, "MAR": 0, "ABR": 0.0, "MAY": 0.0, "JUN": 0.0, "JUL": -1300.0}'::jsonb, 1300, 3800, 5000, 12
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'ROLLO QR DIRECTO', '{"SEP": -3460.0, "OCT": 0.0, "NOV": 0.0, "DIC": 0.0, "ENE": -3456.0, "FEB": -3456.0, "MAR": -3456.0, "ABR": -1728.0, "MAY": -3456.0, "JUN": -7296.0, "JUL": -15360.0}'::jsonb, 18000, 13632, 65000, 13
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SACO DE LONA', '{"SEP": 0.0, "OCT": 0.0, "NOV": 0.0, "DIC": 0.0, "ENE": -660.0, "FEB": -1700.0, "MAR": -1130.0, "ABR": -235.0, "MAY": -60.0, "JUN": -220.0, "JUL": -55.0}'::jsonb, 143, 6000, 5000, 14
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SOBRE DE BURBUJA GRANDE 260x320+45mm', '{"SEP": -5690.0, "OCT": -5627.0, "NOV": -5900.0, "DIC": 0.0, "ENE": 0.0, "FEB": 0.0, "MAR": -6100.0, "ABR": -19200.0, "MAY": -16400.0, "JUN": 0.0, "JUL": 0.0}'::jsonb, 15000, 77000, 40000, 15
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SOBRE DE BURBUJA MEDIANO 220x250+45mm', '{"SEP": 0.0, "OCT": -7661.0, "NOV": -100.0, "DIC": -3200.0, "ENE": 0.0, "FEB": 0.0, "MAR": -1300.0, "ABR": 0.0, "MAY": -15600.0, "JUN": 0.0, "JUL": 0.0}'::jsonb, 15000, 48400, 40000, 16
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SOBRE DE BURBUJA PEQUEÑO 130x180+45mm', '{"SEP": -5380.0, "OCT": -8820.0, "NOV": -6400.0, "DIC": 0.0, "ENE": 0.0, "FEB": 0.0, "MAR": -6400.0, "ABR": -6000.0, "MAY": -9000.0, "JUN": 0.0, "JUL": -1900.0}'::jsonb, 5000, 68800, 40000, 17
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SOBRE DE CARTON VERTICAL 250x345+50MM', '{"SEP": -6200.0, "OCT": -6559.0, "NOV": 0.0, "DIC": -6000.0, "ENE": 0.0, "FEB": 0.0, "MAR": -6600.0, "ABR": -12000.0, "MAY": -12000.0, "JUN": 0.0, "JUL": -6000.0}'::jsonb, 12000, 62300, 40000, 18
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'STRECH FILM - 15', '{"SEP": -2933.0, "OCT": -2808.0, "NOV": -2968.0, "DIC": -3432.0, "ENE": -4000.0, "FEB": -3841.0, "MAR": -4584.0, "ABR": -1920.0, "MAY": -2400.0, "JUN": -3360.0, "JUL": -708.0}'::jsonb, 2000, 54400, 10000, 19
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, promedio_manual, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'STRECH FILM- 15/2Kg (EMBALAJE)', '{"SEP": -1112.0, "OCT": -1264.0, "NOV": -1007.0, "DIC": -1244.0, "ENE": -980.0, "FEB": -768.0, "MAR": -1306.0, "ABR": -576.0, "MAY": -1584.0, "JUN": -576.0, "JUL": -788.0}'::jsonb, 900, 13036, 5000, 20
FROM public.plantilla_proyeccion WHERE codigo = 'IMP_STO';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CERAMICO GRIS 60X60 SRK66013', '{}'::jsonb, 1329, 500, 1
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PORCELANATO GRIS CHISPEADO 60X60 SRK 76121 A1', '{}'::jsonb, 471, 600, 2
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CERAMICO BLANCO 30X60 LLG36001', '{}'::jsonb, 720, 400, 3
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUMINARIA HIGH BAY LED 6500K LEDVANCE 150W', '{}'::jsonb, 193, 70, 4
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUMINARIA TIPO PANEL LED 22W 2000LM', '{}'::jsonb, 90, 70, 5
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUMINARIA TIPO PANEL LED 40W 4000LM', '{}'::jsonb, 300, 80, 6
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'DETECTOR DE HUMO HAGROY', '{}'::jsonb, 63, 30, 7
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'REFLECTOR LED 200W 6500K PHILIPS', '{}'::jsonb, 75, 30, 8
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'ESTACION MANUAL DOBLE ACCION HAGROY', '{}'::jsonb, 46, 30, 9
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SIRENA ESTROBOSCOPICA HAGROY', '{}'::jsonb, 46, 30, 10
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'DETECTOR DE HUMO NUMENS', '{}'::jsonb, 42, 100, 11
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUMINARIA HIGH BAY LED 6500K LEDVANCE 200W', '{}'::jsonb, 46, 40, 12
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUCES DE EMERGENCIA 8H', '{}'::jsonb, 14, 50, 13
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 4 MM VERDE/AMARILLO INDECO X ROLLO', '{}'::jsonb, 30, 1, 14
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 4 MM NEGRO INDECO X ROLLO', '{}'::jsonb, 25, 1, 15
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'cable NH -90 de 2.5 mm INDECO NEGRO x rollo', '{}'::jsonb, 17, 15, 16
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'BATERIA 12V/7AH P/ PANEL', '{}'::jsonb, 22, 30, 17
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'cable NH -90 de 2.5 mm INDECO ROJO x rollo', '{}'::jsonb, 15, 15, 18
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PANEL CONVENCIONAL 5 ZONAS', '{}'::jsonb, 11, 15, 19
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'LUMINARIA HIGH BAY LED 6500K PHILIPS 100W', '{}'::jsonb, 3, 0, 20
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'cable NH -90 de 2.5 mm INDECO AZUL x rollo', '{}'::jsonb, 13, 15, 21
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'cable NH -90 de 2.5 mm INDECO TIERRA AMARILLO/VERDE x rollo', '{}'::jsonb, 12, 12, 22
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 4 MM AZUL INDECO X ROLLO', '{}'::jsonb, 9, 15, 23
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 4 MM BLANCO INDECO X ROLLO', '{}'::jsonb, 9, 1, 24
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 4 MM ROJO INDECO X ROLLO', '{}'::jsonb, 9, 10, 25
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'ESTACION MANUAL DOBLE ACCION FIRE-LITE', '{}'::jsonb, 5, 12, 26
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 6 MM AZUL INDECO X ROLLO', '{}'::jsonb, 8, 1, 27
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 6 MM NEGRO INDECO X ROLLO', '{}'::jsonb, 8, 1, 28
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'SIRENA SYSTEM SENSOR (SIRENA ESTROBOSCOPICA SYSTEM SENSOR)', '{}'::jsonb, 5, 12, 29
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 6 MM ROJO INDECO X ROLLO', '{}'::jsonb, 7, 1, 30
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE FPLR 2X18 CALIBRE 18 AWG - 305 METROS', '{}'::jsonb, 5, 0, 31
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'DETECTOR PHOTOBEAN HAGROY', '{}'::jsonb, 5, 30, 32
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'REFLECTOR LED 300W 6500K PHILIPS', '{}'::jsonb, 16, 0, 33
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 6 MM BLANCO X ROLLO', '{}'::jsonb, 5, 1, 34
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'CABLE NH -90 DE 6 MM VERDE/AMARILLO X ROLLO', '{}'::jsonb, 5, 1, 35
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'DETECTOR PHOTOBEAN GST', '{}'::jsonb, 1, 4, 36
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PANEL RAVEL 08 ZONAS (PANEL RAVEL 08 ZONAS 2 HILOS CERT UL)', '{}'::jsonb, 2, 5, 37
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
INSERT INTO public.item_proyeccion (id_plantilla, nombre_producto, datos_meses, stock_manual, stock_redondeado_manual, orden_fila)
SELECT id_plantilla, 'PANEL RAVEL 04 ZONAS 2 HILOS CERT UL (PANEL RAVEL 04 ZONAS)', '{}'::jsonb, 2, 0, 38
FROM public.plantilla_proyeccion WHERE codigo = 'CONST';
COMMIT;
