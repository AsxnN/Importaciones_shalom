-- Reversa de Migración: 202609020023_vista_producto_detalle_y_recepcion_modo.down.sql
-- Propósito: Revertir la vista v_producto_detalle y restaurar las RPCs a sus versiones previas.

BEGIN;

-- 1. Eliminar la vista consolidada
DROP VIEW IF EXISTS public.v_producto_detalle;

-- 2. Notificar recarga de esquema a PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
