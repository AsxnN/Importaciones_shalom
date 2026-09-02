import { supabase } from './supabase'

export async function logCatalogChange({
  tabla,
  operacion,
  id_registro,
  datos_anteriores = null,
  datos_nuevos = null
}: {
  tabla: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE'
  id_registro: string | number
  datos_anteriores?: unknown
  datos_nuevos?: unknown
}) {
  try {
    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('auditoria_catalogo').insert({
      tabla,
      operacion,
      id_registro: String(id_registro),
      auth_user_id: userData?.user?.id ?? null,
      datos_anteriores: datos_anteriores ? JSON.parse(JSON.stringify(datos_anteriores)) : null,
      datos_nuevos: datos_nuevos ? JSON.parse(JSON.stringify(datos_nuevos)) : null
    })
  } catch (err) {
    // La auditoría no debe bloquear la operación principal si falla la red
    console.warn('No se pudo registrar la auditoría de catálogo:', err)
  }
}
