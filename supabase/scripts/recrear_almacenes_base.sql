-- ==============================================================================
-- SCRIPT DE RECREACIÓN DE ALMACENES BASE — IMPORTACIONES SHALOM
-- Fecha: 2026-10-17
-- Propósito: Elimina los almacenes previos e inicializa los 4 almacenes solicitados:
--            1. IMPORTACIONES  (Tipo: PRINCIPAL, Prefijo RFID: IMP)
--            2. STORE          (Tipo: TIENDA,    Prefijo RFID: STO)
--            3. ABASTECIMIENTO (Tipo: PRINCIPAL, Prefijo RFID: ABA)
--            4. CONSTRUCCIÓN   (Tipo: PRINCIPAL, Prefijo RFID: CON)
-- ==============================================================================

BEGIN;

-- 1. Limpieza de datos dependientes y temporales vinculados a almacenes
DELETE FROM public.inventario;
DELETE FROM public.etiqueta_rfid;
DELETE FROM public.celda_rack;
DELETE FROM public.carril;
DELETE FROM public.secuencia_rfid;

-- 2. Eliminar almacenes anteriores
DELETE FROM public.almacen;

-- 3. Insertar los 4 nuevos almacenes oficiales
INSERT INTO public.almacen (nombre, tipo, capacidad_m3, activo, prefijo_rfid) VALUES
  ('IMPORTACIONES',  'PRINCIPAL', 1500, true, 'IMP'),
  ('STORE',          'TIENDA',     500, true, 'STO'),
  ('ABASTECIMIENTO', 'PRINCIPAL', 1000, true, 'ABA'),
  ('CONSTRUCCIÓN',   'PRINCIPAL', 2000, true, 'CON');

-- 4. Inicializar correlativos RFID en 0 para cada almacén nuevo
INSERT INTO public.secuencia_rfid (id_almacen, ultimo_numero)
SELECT id_almacen, 0 FROM public.almacen
ON CONFLICT (id_almacen) DO UPDATE SET ultimo_numero = 0;

-- 5. Inicializar la Zona de Campo oficial (Piso Libre) para cada almacén
INSERT INTO public.celda_rack (id_almacen, tipo_ubicacion, codigo_ubicacion, descripcion)
SELECT id_almacen, 'CAMPO', 'ALM' || id_almacen::text || '-CAMPO', 'Zona de Piso / Almacenamiento Libre en Campo'
FROM public.almacen;

COMMIT;

-- Verificación final
SELECT id_almacen, nombre, tipo, capacidad_m3, activo, prefijo_rfid
FROM public.almacen
ORDER BY id_almacen ASC;
