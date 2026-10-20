-- ==============================================================================
-- SCRIPT 1: RESET Y BORRADO TOTAL DE BASE DE DATOS (CONSERVANDO USUARIOS Y ROLES)
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-17
-- Propósito: Elimina todas las existencias, paletas, movimientos, recepciones,
--            auditorías, carriles, celdas, órdenes, catálogo de productos y almacenes.
--            CONSERVA INTACTOS: auth.users, public.usuario, public.rol,
--            public.usuario_rol, public.permiso y public.rol_permiso.
-- ==============================================================================

BEGIN;

-- 1. Limpieza de Auditorías y Sesiones de Conteo ERI (Módulo 05)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_sesion_lectura') THEN
    DELETE FROM public.auditoria_sesion_lectura;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_sesion_producto') THEN
    DELETE FROM public.auditoria_sesion_producto;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_sesion') THEN
    DELETE FROM public.auditoria_sesion;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_eri') THEN
    DELETE FROM public.auditoria_eri;
  END IF;
END $$;

-- 2. Limpieza de Conciliaciones Ciegas y Recepciones Tácticas (Módulo 04)
DO $$ BEGIN
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

-- 3. Limpieza de Kardex / Movimientos y Alertas del Sistema (Módulos 02 y 03)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'movimiento') THEN
    DELETE FROM public.movimiento;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alerta_sistema') THEN
    DELETE FROM public.alerta_sistema;
  END IF;
END $$;

-- 4. Limpieza de Paletas Físicas, Celdas, Túneles Drive-In e Inventario (Módulo 02)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etiqueta_asignacion_historico') THEN
    DELETE FROM public.etiqueta_asignacion_historico;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etiqueta_rfid') THEN
    DELETE FROM public.etiqueta_rfid;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'celda_rack') THEN
    DELETE FROM public.celda_rack;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nivel_carril') THEN
    DELETE FROM public.nivel_carril;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'carril') THEN
    DELETE FROM public.carril;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'secuencia_rfid') THEN
    DELETE FROM public.secuencia_rfid;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventario') THEN
    DELETE FROM public.inventario;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dispositivo_iot') THEN
    DELETE FROM public.dispositivo_iot;
  END IF;
END $$;

-- 5. Limpieza de Órdenes de Compra / Importación (Módulo 03 / 06)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'detalle_orden') THEN
    DELETE FROM public.detalle_orden;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orden_importacion') THEN
    DELETE FROM public.orden_importacion;
  END IF;
END $$;

-- 6. Limpieza de Productos, Fichas de Empaque y Almacenes (Módulos 01 y 02)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'esquema_camita') THEN
    DELETE FROM public.esquema_camita;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'regla_empaque') THEN
    DELETE FROM public.regla_empaque;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'producto') THEN
    DELETE FROM public.producto;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categoria') THEN
    DELETE FROM public.categoria;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'proveedor') THEN
    DELETE FROM public.proveedor;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'almacen') THEN
    DELETE FROM public.almacen;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria_catalogo') THEN
    DELETE FROM public.auditoria_catalogo;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auditoria') THEN
    DELETE FROM public.auditoria;
  END IF;
END $$;

-- 7. NOTA DE SEGURIDAD:
-- Las tablas auth.users, public.usuario, public.rol, public.usuario_rol,
-- public.permiso y public.rol_permiso permanecen 100% INTACTAS.
-- No perderás usuarios, sesiones ni contraseñas.

COMMIT;

-- Verificación de tablas limpias:
SELECT
  (SELECT COUNT(*) FROM public.almacen) as almacenes,
  (SELECT COUNT(*) FROM public.producto) as productos,
  (SELECT COUNT(*) FROM public.inventario) as existencias,
  (SELECT COUNT(*) FROM public.etiqueta_rfid) as paletas_rfid,
  (SELECT COUNT(*) FROM public.usuario) as usuarios_conservados;
