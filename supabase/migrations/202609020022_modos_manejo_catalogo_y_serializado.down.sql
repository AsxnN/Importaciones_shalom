-- Reversa de Migración: 202609020022_modos_manejo_catalogo_y_serializado.down.sql
-- Propósito: Revertir de forma segura y completa los cambios de la migración 202609020022.

BEGIN;

-- 1. Eliminar trigger y función de validación de empaque
DROP TRIGGER IF EXISTS trg_validar_regla_empaque_modo ON public.regla_empaque;
DROP FUNCTION IF EXISTS public.fn_validar_regla_empaque_modo();

-- 2. Eliminar políticas RLS
DROP POLICY IF EXISTS "unidad_serializada: gestion administrador y operario" ON public.unidad_serializada;
DROP POLICY IF EXISTS "unidad_serializada: lectura autenticada" ON public.unidad_serializada;

DROP POLICY IF EXISTS "perfil_serializado: gestion administrador y comprador" ON public.perfil_serializado;
DROP POLICY IF EXISTS "perfil_serializado: lectura autenticada" ON public.perfil_serializado;

DROP POLICY IF EXISTS "modo_manejo: gestion administrador y comprador" ON public.modo_manejo;
DROP POLICY IF EXISTS "modo_manejo: lectura autenticada" ON public.modo_manejo;

-- 3. Eliminar tablas del modo serializado (orden descendente por FK)
DROP TABLE IF EXISTS public.unidad_serializada CASCADE;
DROP TABLE IF EXISTS public.perfil_serializado CASCADE;

-- 4. Revertir columna modo_manejo en categoria
DROP INDEX IF EXISTS public.idx_categoria_modo_manejo;
ALTER TABLE public.categoria DROP COLUMN IF EXISTS modo_manejo;

-- 5. Eliminar catálogo de modos de manejo
DROP TABLE IF EXISTS public.modo_manejo CASCADE;

COMMIT;
