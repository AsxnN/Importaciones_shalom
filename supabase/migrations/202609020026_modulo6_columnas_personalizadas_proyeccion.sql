-- ==============================================================================
-- Migración: Módulo 06 - Columnas personalizadas con dinámica de ecuaciones Excel
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-26
-- ==============================================================================

BEGIN;

-- 1. Agregar columna para almacenar definiciones de columnas personalizadas y sus ecuaciones en formato JSONB
ALTER TABLE public.plantilla_proyeccion
  ADD COLUMN IF NOT EXISTS columnas_personalizadas jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
