-- ==============================================================================
-- Migración: admin_cambiar_password RPC
-- Proyecto: Importaciones Shalom
-- Fecha: 2026-10-19
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_cambiar_password(
  p_id_usuario bigint,
  p_nueva_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  -- 1. Verificar si el usuario que ejecuta la función es ADMINISTRADOR
  IF NOT (public.tiene_rol(ARRAY['ADMINISTRADOR']) OR public.es_administrador()) THEN
    RAISE EXCEPTION 'Acceso denegado: solo un administrador puede cambiar contraseñas.';
  END IF;

  -- 2. Validar que la contraseña cumpla los requisitos mínimos
  IF length(trim(p_nueva_password)) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
  END IF;

  -- 3. Obtener el auth_user_id vinculado al id_usuario
  SELECT auth_user_id INTO v_auth_user_id
  FROM public.usuario
  WHERE id_usuario = p_id_usuario;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'El usuario no tiene una cuenta de autenticación vinculada en auth.users.';
  END IF;

  -- 4. Actualizar la contraseña en auth.users usando pgcrypto
  UPDATE auth.users
  SET 
    encrypted_password = extensions.crypt(trim(p_nueva_password), extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = v_auth_user_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cambiar_password(bigint, text) TO authenticated;

COMMIT;
