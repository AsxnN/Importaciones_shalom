export type SystemRole = 'ADMINISTRADOR' | 'COMPRADOR' | 'OPERARIO' | 'AUDITOR'

export interface RoleItem {
  id_rol: number
  nombre_rol: string
  descripcion: string | null
  activo: boolean
}

export interface DetailedRole {
  id_rol: number
  nombre_rol: string
  descripcion: string | null
}

export interface AppUser {
  id_usuario: number
  auth_user_id: string | null
  nombre_completo: string
  codigo_operario: string | null
  correo: string | null
  activo: boolean
  created_at: string
  roles: string[]
  roles_detallados: DetailedRole[]
}

export interface CreateUserForm {
  nombre_completo: string
  correo: string
  password: string
  codigo_operario?: string
  roles: string[]
  activo: boolean
}

export interface UpdateUserForm {
  id_usuario: number
  auth_user_id?: string | null
  nombre_completo: string
  correo: string
  password?: string
  codigo_operario?: string
  roles: string[]
  activo: boolean
}
