-- ==============================================================================
-- Migración: Módulo 06 - Historial de Órdenes y Proyecciones Periódicas
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-11-01
-- ==============================================================================

BEGIN;

-- 1. Añadir columnas a orden_importacion para vinculación con proyecciones y metadatos
ALTER TABLE public.orden_importacion
  ADD COLUMN IF NOT EXISTS id_plantilla bigint REFERENCES public.plantilla_proyeccion(id_plantilla) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS snapshot_proyeccion jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_items integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_unidades numeric DEFAULT 0;

-- 2. Asegurar políticas RLS para orden_importacion y detalle_orden
DROP POLICY IF EXISTS "orden_importacion_lectura" ON public.orden_importacion;
CREATE POLICY "orden_importacion_lectura" ON public.orden_importacion
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "orden_importacion_gestion" ON public.orden_importacion;
CREATE POLICY "orden_importacion_gestion" ON public.orden_importacion
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR', 'OPERARIO']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR', 'COMPRADOR']));

COMMIT;
