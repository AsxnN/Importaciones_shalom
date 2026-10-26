-- ==============================================================================
-- Migración: Módulo 06 - Rango dinámico de meses y fórmulas por columna
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-22
-- ==============================================================================

BEGIN;

-- 1. Agregar columnas para selección de rango de meses y fórmulas dinámicas a plantilla_proyeccion
ALTER TABLE public.plantilla_proyeccion
  ADD COLUMN IF NOT EXISTS mes_inicio_promedio varchar DEFAULT 'SEP',
  ADD COLUMN IF NOT EXISTS mes_fin_promedio varchar DEFAULT 'JUL',
  ADD COLUMN IF NOT EXISTS ignorar_meses_cero boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS formula_stock_redondeado varchar DEFAULT 'REDONDEAR_COMERCIAL(stock_min_f)';

-- 2. Asegurar que las plantillas por defecto tengan sus rangos de meses configurados
UPDATE public.plantilla_proyeccion
SET 
  mes_inicio_promedio = COALESCE(mes_inicio_promedio, 'SEP'),
  mes_fin_promedio = COALESCE(mes_fin_promedio, 'JUL'),
  ignorar_meses_cero = COALESCE(ignorar_meses_cero, true)
WHERE codigo = 'IMP_STO';

UPDATE public.plantilla_proyeccion
SET 
  mes_inicio_promedio = COALESCE(mes_inicio_promedio, NULL),
  mes_fin_promedio = COALESCE(mes_fin_promedio, NULL),
  ignorar_meses_cero = COALESCE(ignorar_meses_cero, true)
WHERE codigo = 'CONST';

COMMIT;
