-- ==============================================================================
-- Migración: Módulo 08 - Administración de Usuarios, Roles y Seguridad RBAC
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-18
-- ==============================================================================

BEGIN;

-- 1. Asegurar catálogo de roles base
INSERT INTO public.rol (nombre_rol, descripcion, activo)
VALUES
  ('ADMINISTRADOR', 'Control total del sistema: gestión de usuarios, roles, catálogo, almacenes e inventario.', true),
  ('COMPRADOR', 'Gestión comercial: compras, proveedores, órdenes de importación y catálogo de productos.', true),
  ('OPERARIO', 'Operaciones de campo: recepciones RFID en muelle, transferencias y movimientos de almacén.', true),
  ('AUDITOR', 'Supervisión de calidad: auditorías ERI (Exactitud de Registro) e inspección de inventario.', true)
ON CONFLICT (nombre_rol) DO UPDATE 
SET descripcion = excluded.descripcion, activo = true;

-- 2. Asegurar permisos base por módulo
INSERT INTO public.permiso (codigo_modulo, accion, descripcion)
VALUES
  ('PRODUCTOS', 'VER', 'Visualizar catálogo maestro y reglas de empaque'),
  ('INVENTARIO', 'VER', 'Visualizar stock, almacenes, racks y paletas'),
  ('RECEPCIONES', 'VER', 'Operar recepciones tácticas y conciliación ciega'),
  ('AUDITORIAS', 'VER', 'Ejecutar auditorías ERI por producto y lecturas'),
  ('ORDENES', 'VER', 'Gestionar órdenes de importación y contenedores'),
  ('USUARIOS', 'VER', 'Administrar usuarios, roles y seguridad RBAC')
ON CONFLICT (codigo_modulo, accion) DO NOTHING;

-- 3. Habilitar RLS en tablas de usuarios
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permiso ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para 'rol'
DROP POLICY IF EXISTS "rol_lectura" ON public.rol;
DROP POLICY IF EXISTS "rol: lectura autenticada" ON public.rol;
CREATE POLICY "rol_lectura_autenticada" ON public.rol
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rol: administrar" ON public.rol;
CREATE POLICY "rol_administrar" ON public.rol
  FOR ALL TO authenticated
  USING (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']));

-- 5. Políticas RLS para 'usuario'
DROP POLICY IF EXISTS "usuario: leer perfil propio o administrar" ON public.usuario;
DROP POLICY IF EXISTS "usuario_lectura" ON public.usuario;
CREATE POLICY "usuario_lectura" ON public.usuario
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']));

DROP POLICY IF EXISTS "usuario: administrar" ON public.usuario;
DROP POLICY IF EXISTS "usuario_administrar" ON public.usuario;
CREATE POLICY "usuario_administrar" ON public.usuario
  FOR ALL TO authenticated
  USING (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']));

-- 6. Políticas RLS para 'usuario_rol'
DROP POLICY IF EXISTS "usuario_rol: leer propio o administrar" ON public.usuario_rol;
DROP POLICY IF EXISTS "usuario_rol_lectura" ON public.usuario_rol;
CREATE POLICY "usuario_rol_lectura" ON public.usuario_rol
  FOR SELECT TO authenticated
  USING (
    public.es_administrador() 
    OR public.tiene_rol(ARRAY['ADMINISTRADOR']) 
    OR id_usuario IN (SELECT id_usuario FROM public.usuario WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "usuario_rol: administrar" ON public.usuario_rol;
DROP POLICY IF EXISTS "usuario_rol_administrar" ON public.usuario_rol;
CREATE POLICY "usuario_rol_administrar" ON public.usuario_rol
  FOR ALL TO authenticated
  USING (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.es_administrador() OR public.tiene_rol(ARRAY['ADMINISTRADOR']));

-- 7. Auto-vincular usuarios existentes en auth.users a public.usuario y asignarles ADMINISTRADOR
INSERT INTO public.usuario (auth_user_id, nombre_completo, correo, activo)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email, 'Usuario Principal'), 
  email, 
  true
FROM auth.users
ON CONFLICT (auth_user_id) DO UPDATE 
SET activo = true, correo = EXCLUDED.correo;

INSERT INTO public.usuario_rol (id_usuario, id_rol, activo)
SELECT u.id_usuario, r.id_rol, true
FROM public.usuario u
CROSS JOIN public.rol r
WHERE r.nombre_rol = 'ADMINISTRADOR'
ON CONFLICT (id_usuario, id_rol) DO UPDATE SET activo = true;

COMMIT;
