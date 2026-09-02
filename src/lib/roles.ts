export type AppRole = 'ADMINISTRADOR' | 'COMPRADOR' | 'OPERARIO' | 'AUDITOR'
export type UserProfile = { nombre_completo: string | null; roles: AppRole[]; permisos: string[] }
export const modules = [
  { key: 'productos', name: 'Productos y empaque', permission: 'PRODUCTOS.VER', roles: ['ADMINISTRADOR', 'COMPRADOR'] },
  { key: 'inventario', name: 'Inventario', permission: 'INVENTARIO.VER', roles: ['ADMINISTRADOR', 'OPERARIO', 'AUDITOR'] },
  { key: 'ordenes', name: 'Órdenes de importación', permission: 'ORDENES.VER', roles: ['ADMINISTRADOR', 'COMPRADOR'] },
  { key: 'recepciones', name: 'Recepciones RFID', permission: 'RECEPCIONES.VER', roles: ['ADMINISTRADOR', 'OPERARIO', 'AUDITOR'] },
  { key: 'auditorias', name: 'Auditorías ERI', permission: 'AUDITORIAS.VER', roles: ['ADMINISTRADOR', 'AUDITOR'] },
  { key: 'usuarios', name: 'Usuarios y permisos', permission: 'USUARIOS.VER', roles: ['ADMINISTRADOR'] },
] as const
export function canAccess(profile: UserProfile | null, permission: string, fallbackRoles: readonly string[]) { return !!profile && (profile.roles.includes('ADMINISTRADOR') || profile.permisos.includes(permission) || profile.roles.some((role) => fallbackRoles.includes(role))) }
