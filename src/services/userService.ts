import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AppUser, CreateUserForm, RoleItem, UpdateUserForm } from '../types/users'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const userService = {
  // 1. Obtener la lista completa de usuarios con sus roles asociados
  async getUsers(): Promise<AppUser[]> {
    try {
      // Intento primario: embebido directo especificando la clave foránea exacta (usuario_rol_id_usuario_fkey)
      const { data, error } = await supabase
        .from('usuario')
        .select(`
          id_usuario,
          auth_user_id,
          nombre_completo,
          codigo_operario,
          correo,
          activo,
          created_at,
          usuario_rol:usuario_rol!usuario_rol_id_usuario_fkey (
            id_rol,
            activo,
            rol (
              id_rol,
              nombre_rol,
              descripcion
            )
          )
        `)
        .order('id_usuario', { ascending: true })

      if (error) {
        console.warn('Advertencia en embebido de usuarios, activando fallback desacoplado:', error)

        // Fallback resiliente: consultar usuarios y roles por separado para evitar ambigüedades de PostgREST
        const { data: usersData, error: userError } = await supabase
          .from('usuario')
          .select('id_usuario, auth_user_id, nombre_completo, codigo_operario, correo, activo, created_at')
          .order('id_usuario', { ascending: true })

        if (userError) throw userError

        const { data: rolesData, error: rolesError } = await supabase
          .from('usuario_rol')
          .select(`
            id_usuario,
            id_rol,
            activo,
            rol (
              id_rol,
              nombre_rol,
              descripcion
            )
          `)
          .eq('activo', true)

        if (rolesError) {
          console.warn('No se pudieron obtener roles en el fallback:', rolesError)
        }

        const rolesByUserId = new Map<number, any[]>()
        for (const item of (rolesData || [])) {
          const list = rolesByUserId.get(item.id_usuario) || []
          list.push(item)
          rolesByUserId.set(item.id_usuario, list)
        }

        return (usersData || []).map((u: any) => {
          const userRoles = rolesByUserId.get(u.id_usuario) || []
          const activeRoles = userRoles
            .filter((ur: any) => ur.rol)
            .map((ur: any) => ({
              id_rol: ur.rol.id_rol,
              nombre_rol: ur.rol.nombre_rol,
              descripcion: ur.rol.descripcion
            }))

          return {
            id_usuario: u.id_usuario,
            auth_user_id: u.auth_user_id,
            nombre_completo: u.nombre_completo,
            codigo_operario: u.codigo_operario,
            correo: u.correo,
            activo: u.activo,
            created_at: u.created_at,
            roles: activeRoles.map((r: any) => r.nombre_rol),
            roles_detallados: activeRoles
          }
        })
      }

      return (data || []).map((u: any) => {
        const rawUserRoles = Array.isArray(u.usuario_rol) ? u.usuario_rol : []
        const activeRoles = rawUserRoles
          .filter((ur: any) => ur.activo !== false && ur.rol)
          .map((ur: any) => ({
            id_rol: ur.rol.id_rol,
            nombre_rol: ur.rol.nombre_rol,
            descripcion: ur.rol.descripcion
          }))

        return {
          id_usuario: u.id_usuario,
          auth_user_id: u.auth_user_id,
          nombre_completo: u.nombre_completo,
          codigo_operario: u.codigo_operario,
          correo: u.correo,
          activo: u.activo,
          created_at: u.created_at,
          roles: activeRoles.map((r: any) => r.nombre_rol),
          roles_detallados: activeRoles
        }
      })
    } catch (err) {
      console.error('Exception in getUsers:', err)
      return []
    }
  },

  // 2. Obtener los roles base del sistema
  async getRoles(): Promise<RoleItem[]> {
    try {
      const { data, error } = await supabase
        .from('rol')
        .select('id_rol, nombre_rol, descripcion, activo')
        .eq('activo', true)
        .order('id_rol', { ascending: true })

      if (error) throw error
      return (data as RoleItem[]) || []
    } catch (err) {
      console.error('Exception in getRoles:', err)
      return []
    }
  },

  // 3. Crear un nuevo usuario en auth.users y public.usuario
  async createUser(form: CreateUserForm): Promise<{ success: boolean; id_usuario?: number; error?: string }> {
    try {
      const cleanEmail = form.correo.trim().toLowerCase()
      const cleanName = form.nombre_completo.trim()

      if (!cleanEmail || !cleanName) {
        return { success: false, error: 'El nombre completo y correo electrónico son obligatorios.' }
      }

      // Validar si el correo ya existe en public.usuario
      const { data: existingUser } = await supabase
        .from('usuario')
        .select('id_usuario')
        .eq('correo', cleanEmail)
        .maybeSingle()

      if (existingUser) {
        return { success: false, error: `Ya existe un usuario registrado con el correo "${cleanEmail}".` }
      }

      let authUserId: string | null = null

      // Si se proporcionó contraseña, registrar credenciales en Supabase Auth
      if (form.password && form.password.trim()) {
        if (form.password.trim().length < 6) {
          return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
        }

        // Instancia aislada para no cerrar la sesión del administrador actual
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })

        const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
          email: cleanEmail,
          password: form.password.trim(),
          options: {
            data: {
              full_name: cleanName
            }
          }
        })

        if (authError) {
          // Si el usuario ya existe en Auth, buscar su id
          if (authError.message.toLowerCase().includes('already registered')) {
            console.warn('Usuario ya existe en auth.users, continuando vinculación.')
          } else {
            return { success: false, error: `Error creando credenciales de acceso: ${authError.message}` }
          }
        } else if (authData.user) {
          authUserId = authData.user.id
        }
      }

      // Determinar o insertar en public.usuario
      let idUsuario: number | null = null

      if (authUserId) {
        // Verificar si ya existe en public.usuario (por trigger o previo)
        const { data: existingByAuth } = await supabase
          .from('usuario')
          .select('id_usuario')
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        if (existingByAuth?.id_usuario) {
          idUsuario = existingByAuth.id_usuario
          await supabase
            .from('usuario')
            .update({
              nombre_completo: cleanName,
              codigo_operario: form.codigo_operario?.trim().toUpperCase() || null,
              correo: cleanEmail,
              activo: form.activo !== false
            })
            .eq('id_usuario', idUsuario)
        }
      }

      if (!idUsuario) {
        const { data: createdUser, error: userError } = await supabase
          .from('usuario')
          .insert({
            auth_user_id: authUserId,
            nombre_completo: cleanName,
            codigo_operario: form.codigo_operario?.trim().toUpperCase() || null,
            correo: cleanEmail,
            activo: form.activo !== false
          })
          .select('id_usuario')
          .single()

        if (userError || !createdUser) {
          return { success: false, error: userError?.message || 'Error al guardar el perfil del usuario.' }
        }

        idUsuario = createdUser.id_usuario
      }

      // Asignar roles en public.usuario_rol
      if (form.roles && form.roles.length > 0) {
        const rolesList = await this.getRoles()
        const roleMap = new Map(rolesList.map((r) => [r.nombre_rol, r.id_rol]))

        const roleInserts = form.roles
          .map((roleName) => roleMap.get(roleName))
          .filter((idRol): idRol is number => typeof idRol === 'number')
          .map((idRol) => ({
            id_usuario: idUsuario,
            id_rol: idRol,
            activo: true
          }))

        if (roleInserts.length > 0) {
          const { error: roleError } = await supabase.from('usuario_rol').insert(roleInserts)
          if (roleError) {
            console.error('Error assigning roles to new user:', roleError)
          }
        }
      }

      return { success: true, id_usuario: idUsuario ?? undefined }
    } catch (err: any) {
      console.error('Exception in createUser:', err)
      return { success: false, error: err.message || 'Error inesperado al crear usuario.' }
    }
  },

  // 4. Actualizar usuario existente (perfil, roles y contraseña opcional)
  async updateUser(form: UpdateUserForm): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanEmail = form.correo.trim().toLowerCase()
      const cleanName = form.nombre_completo.trim()

      if (!cleanEmail || !cleanName) {
        return { success: false, error: 'El nombre completo y correo electrónico son obligatorios.' }
      }

      // Actualizar datos de perfil en public.usuario
      const { error: updateError } = await supabase
        .from('usuario')
        .update({
          nombre_completo: cleanName,
          codigo_operario: form.codigo_operario?.trim().toUpperCase() || null,
          correo: cleanEmail,
          activo: form.activo
        })
        .eq('id_usuario', form.id_usuario)

      if (updateError) {
        return { success: false, error: updateError.message }
      }

      // Si se proporcionó una nueva contraseña, actualizarla
      if (form.password && form.password.trim()) {
        const passRes = await this.updatePassword(form.id_usuario, form.auth_user_id ?? null, form.password.trim())
        if (!passRes.success) {
          return { success: false, error: passRes.error }
        }
      }

      // Sincronizar roles en public.usuario_rol
      const rolesList = await this.getRoles()
      const roleMap = new Map(rolesList.map((r) => [r.nombre_rol, r.id_rol]))

      // Eliminar asignaciones actuales
      await supabase
        .from('usuario_rol')
        .delete()
        .eq('id_usuario', form.id_usuario)

      // Insertar nuevos roles asignados
      if (form.roles && form.roles.length > 0) {
        const roleInserts = form.roles
          .map((roleName) => roleMap.get(roleName))
          .filter((idRol): idRol is number => typeof idRol === 'number')
          .map((idRol) => ({
            id_usuario: form.id_usuario,
            id_rol: idRol,
            activo: true
          }))

        if (roleInserts.length > 0) {
          const { error: roleError } = await supabase.from('usuario_rol').insert(roleInserts)
          if (roleError) {
            console.error('Error updating user roles:', roleError)
          }
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error('Exception in updateUser:', err)
      return { success: false, error: err.message || 'Error al actualizar usuario.' }
    }
  },

  // 5. Cambiar contraseña de un usuario (propia o por administrador)
  async updatePassword(
    id_usuario: number,
    auth_user_id: string | null,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanPass = newPassword.trim()
      if (!cleanPass || cleanPass.length < 6) {
        return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' }
      }

      // 1. Verificar si es el usuario autenticado actualmente en sesión
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const isCurrentUser = currentUser && auth_user_id && currentUser.id === auth_user_id

      if (isCurrentUser) {
        // Actualizar la propia contraseña directamente con el SDK de Supabase Auth
        const { error: authError } = await supabase.auth.updateUser({
          password: cleanPass
        })

        if (authError) {
          return { success: false, error: `Error al actualizar tu contraseña: ${authError.message}` }
        }

        return { success: true }
      }

      // 2. Si es otro usuario, invocar la función RPC admin_cambiar_password
      const { error: rpcError } = await supabase.rpc('admin_cambiar_password', {
        p_id_usuario: id_usuario,
        p_nueva_password: cleanPass
      })

      if (rpcError) {
        console.error('Error invoking admin_cambiar_password RPC:', rpcError)
        return {
          success: false,
          error: `Error al cambiar contraseña de usuario: ${rpcError.message}. Verifica haber ejecutado la función RPC admin_cambiar_password en Supabase.`
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error('Exception in updatePassword:', err)
      return { success: false, error: err.message || 'Error inesperado al cambiar contraseña.' }
    }
  },

  // 5. Alternar estado activo / inactivo
  async toggleUserStatus(id_usuario: number, newStatus: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('usuario')
        .update({ activo: newStatus })
        .eq('id_usuario', id_usuario)

      if (error) throw error
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al cambiar estado del usuario.' }
    }
  },

  // 6. Eliminar usuario (con protección de integridad referencial)
  async deleteUser(id_usuario: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Intentar borrado directo
      const { error } = await supabase
        .from('usuario')
        .delete()
        .eq('id_usuario', id_usuario)

      if (error) {
        // Si hay registros históricos asociados (movimientos, recepciones), desactivar en lugar de romper integridad
        if (error.code === '23503') {
          await supabase
            .from('usuario')
            .update({ activo: false })
            .eq('id_usuario', id_usuario)

          return {
            success: true,
            error: 'El usuario tiene movimientos y registros históricos asociados, por lo que fue desactivado en lugar de eliminarse para preservar la trazabilidad.'
          }
        }
        throw error
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al eliminar usuario.' }
    }
  }
}
