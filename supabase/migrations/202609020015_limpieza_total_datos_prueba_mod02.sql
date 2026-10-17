-- ==============================================================================
-- SCRIPT DE RESET Y LIMPIEZA TOTAL DE DATOS OPERATIVOS (MÓDULO 02 WMS)
-- Fecha: 2026-10-14
-- Propósito: Dejar el sistema completamente limpio en 0 para iniciar pruebas
--            de registro y baja de paletas con verificación exacta 1:1.
--            (Conserva Catálogo Maestro de Productos, Almacenes y Racks).
-- ==============================================================================

BEGIN;

-- 1. Limpiar auditorías y sesiones de lectura
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_sesion_lectura') THEN
    DELETE FROM public.auditoria_sesion_lectura;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_eri') THEN
    DELETE FROM public.auditoria_eri;
  END IF;
END $$;

-- 2. Limpiar conciliaciones y recepciones tácticas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conciliacion_ciega') THEN
    DELETE FROM public.conciliacion_ciega;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recepcion_lectura') THEN
    DELETE FROM public.recepcion_lectura;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sesion_recepcion') THEN
    DELETE FROM public.sesion_recepcion;
  END IF;
END $$;

-- 3. Limpiar movimientos de Kardex
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'movimiento') THEN
    DELETE FROM public.movimiento;
  END IF;
END $$;

-- 4. Eliminar todas las paletas físicas activas (etiqueta_rfid)
DELETE FROM public.etiqueta_rfid;

-- 5. Resetear todas las existencias contables a 0 unidades y semáforo ROJO
UPDATE public.inventario
SET stock_real = 0,
    estado_semaforo = 'ROJO',
    updated_at = NOW();

COMMIT;
