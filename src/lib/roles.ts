export type AppRole = 'ADMINISTRADOR' | 'COMPRADOR' | 'OPERARIO' | 'AUDITOR'
export type UserProfile = { nombre_completo: string | null; roles: AppRole[]; permisos: string[] }
export const modules = [
  { key: 'productos', code: '01', name: 'Maestros y empaque', permission: 'PRODUCTOS.VER', roles: ['ADMINISTRADOR', 'COMPRADOR'] },
  { key: 'inventario', code: '02', name: 'Inventario y almacenes', permission: 'INVENTARIO.VER', roles: ['ADMINISTRADOR', 'OPERARIO', 'AUDITOR'] },
  { key: 'movimientos', code: '03', name: 'Movimientos y transferencias', permission: 'INVENTARIO.VER', roles: ['ADMINISTRADOR', 'OPERARIO'] },
  { key: 'recepciones', code: '04', name: 'Recepciones RFID', permission: 'RECEPCIONES.VER', roles: ['ADMINISTRADOR', 'OPERARIO', 'AUDITOR'] },
  { key: 'auditorias', code: '05', name: 'Auditorías RFID (ERI)', permission: 'AUDITORIAS.VER', roles: ['ADMINISTRADOR', 'AUDITOR'] },
  { key: 'ordenes', code: '06', name: 'Órdenes y proyecciones', permission: 'ORDENES.VER', roles: ['ADMINISTRADOR', 'COMPRADOR'] },
  { key: 'contenedores', code: '07', name: 'Control de contenedores', permission: 'ORDENES.VER', roles: ['ADMINISTRADOR', 'COMPRADOR'] },
  { key: 'usuarios', code: '08', name: 'Usuarios y permisos', permission: 'USUARIOS.VER', roles: ['ADMINISTRADOR'] },
] as const
export function canAccess(profile: UserProfile | null, permission: string, fallbackRoles: readonly string[]) { return !!profile && (profile.roles.includes('ADMINISTRADOR') || profile.permisos.includes(permission) || profile.roles.some((role) => fallbackRoles.includes(role))) }
