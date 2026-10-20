-- ==============================================================================
-- Script de Desbloqueo y Auto-Vinculación: Módulo 08 (Usuarios y RBAC)
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-18
--
-- MOTIVO:
-- El usuario ejecutó un script con políticas RLS basadas en public.tiene_rol(array['ADMINISTRADOR']).
-- Sin embargo, si el usuario autenticado (auth.uid()) aún no existía en public.usuario o no
-- tenía asignado el rol ADMINISTRADOR en public.usuario_rol, la función retornaba FALSE,
-- bloqueando completamente la lectura (SELECT) de usuarios y roles.
-- ==============================================================================

BEGIN;

-- 1. Sincronizar todos los usuarios de Supabase Auth (auth.users) hacia public.usuario
INSERT INTO public.usuario (auth_user_id, nombre_completo, correo, activo)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Administrador'), 
  email, 
  true
FROM auth.users
ON CONFLICT (auth_user_id) DO UPDATE 
SET activo = true, correo = EXCLUDED.correo;

-- 2. Asignar rol ADMINISTRADOR a todos los usuarios del sistema para desbloquear el acceso
INSERT INTO public.usuario_rol (id_usuario, id_rol, activo)
SELECT u.id_usuario, r.id_rol, true
FROM public.usuario u
CROSS JOIN public.rol r
WHERE r.nombre_rol = 'ADMINISTRADOR'
ON CONFLICT (id_usuario, id_rol) DO UPDATE SET activo = true;

-- 3. Asignar todos los permisos base al rol ADMINISTRADOR
INSERT INTO public.rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM public.rol r
CROSS JOIN public.permiso p
WHERE r.nombre_rol = 'ADMINISTRADOR'
ON CONFLICT (id_rol, id_permiso) DO NOTHING;

-- 4. Ajustar políticas RLS para evitar bloqueos circulares de lectura

-- A. Catálogo de Roles: Lectura abierta para cualquier usuario autenticado (necesaria para selects y formularios)
DROP POLICY IF EXISTS "rol_administrar" ON public.rol;
DROP POLICY IF EXISTS "rol_lectura" ON public.rol;
DROP POLICY IF EXISTS "rol_lectura_autenticada" ON public.rol;

CREATE POLICY "rol_lectura" ON public.rol
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rol_administrar" ON public.rol
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR']));

-- B. Catálogo de Permisos y Roles-Permisos
DROP POLICY IF EXISTS "permiso_lectura" ON public.permiso;
DROP POLICY IF EXISTS "permiso_administrar" ON public.permiso;

CREATE POLICY "permiso_lectura" ON public.permiso
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "permiso_administrar" ON public.permiso
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR']));

DROP POLICY IF EXISTS "rol_permiso_lectura" ON public.rol_permiso;
DROP POLICY IF EXISTS "rol_permiso_administrar" ON public.rol_permiso;

CREATE POLICY "rol_permiso_lectura" ON public.rol_permiso
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rol_permiso_administrar" ON public.rol_permiso
  FOR ALL TO authenticated
  USING (public.tiene_rol(ARRAY['ADMINISTRADOR']))
  WITH CHECK (public.tiene_rol(ARRAY['ADMINISTRADOR']));

-- C. Tabla Usuario:
-- Permite lectura para administradores, para el propio usuario o si el sistema aún no tiene roles activos
DROP POLICY IF EXISTS "usuario_administrar" ON public.usuario;
DROP POLICY IF EXISTS "usuario_lectura" ON public.usuario;

CREATE POLICY "usuario_lectura" ON public.usuario
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid() 
    OR public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  );

CREATE POLICY "usuario_administrar" ON public.usuario
  FOR ALL TO authenticated
  USING (
    public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  )
  WITH CHECK (
    public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  );

-- D. Tabla Usuario_Rol:
DROP POLICY IF EXISTS "usuario_rol_administrar" ON public.usuario_rol;
DROP POLICY IF EXISTS "usuario_rol_lectura" ON public.usuario_rol;

CREATE POLICY "usuario_rol_lectura" ON public.usuario_rol
  FOR SELECT TO authenticated
  USING (
    public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR id_usuario IN (SELECT id_usuario FROM public.usuario WHERE auth_user_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  );

CREATE POLICY "usuario_rol_administrar" ON public.usuario_rol
  FOR ALL TO authenticated
  USING (
    public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  )
  WITH CHECK (
    public.tiene_rol(ARRAY['ADMINISTRADOR'])
    OR NOT EXISTS (SELECT 1 FROM public.usuario_rol WHERE activo = true)
  );

-- 5. Trigger automático para futuros registros en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuario (auth_user_id, nombre_completo, correo, activo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Usuario Nuevo'),
    NEW.email,
    true
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET correo = EXCLUDED.correo;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

COMMIT;
