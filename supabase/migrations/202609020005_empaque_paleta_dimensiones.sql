-- ==============================================================================
-- Migración: Columnas para Dimensiones y Peso de la Paleta Armada
-- Permite almacenar la altura total de la paleta y el peso total en regla_empaque
-- ==============================================================================

alter table if exists public.regla_empaque
  add column if not exists alto_paleta_cm numeric check (alto_paleta_cm is null or alto_paleta_cm > 0),
  add column if not exists peso_paleta_kg numeric check (peso_paleta_kg is null or peso_paleta_kg > 0);
