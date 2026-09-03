-- ==============================================================================
-- Migración: Sincronización de Atributos Logísticos de Producto
-- Sistema de inventario RFID - Importaciones Shalom
-- Agrega columnas utilizadas en el frontend (Módulo 1) y en el importador CSV:
-- nombre, unidad_medida, peso_unitario_kg, costo_unitario, clasificacion_abc
-- ==============================================================================

alter table if exists public.producto
  add column if not exists nombre text,
  add column if not exists unidad_medida varchar(20) default 'UNIDAD',
  add column if not exists peso_unitario_kg numeric(10,3) check (peso_unitario_kg is null or peso_unitario_kg > 0),
  add column if not exists costo_unitario numeric(12,2) check (costo_unitario is null or costo_unitario >= 0),
  add column if not exists clasificacion_abc varchar(5) default 'B' check (clasificacion_abc in ('A', 'B', 'C', ''));

-- Si el nombre está vacío o nulo, sincronizar con descripcion
update public.producto
set nombre = descripcion
where (nombre is null or trim(nombre) = '') and descripcion is not null;

-- Si descripcion está vacía o nula, sincronizar con nombre
update public.producto
set descripcion = nombre
where (descripcion is null or trim(descripcion) = '') and nombre is not null;
