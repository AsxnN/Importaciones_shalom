import { supabase } from '../../../lib/supabase'
import type { EstadoUnidadSerial, UnidadSerializada } from '../types'

export interface UnidadSerializadaRepository {
  obtenerPorProducto(idProducto: number | string): Promise<UnidadSerializada[]>
  obtenerPorId(idUnidad: number | string): Promise<UnidadSerializada | null>
  guardar(unidad: Partial<UnidadSerializada>): Promise<UnidadSerializada>
  cambiarEstado(idUnidad: number | string, nuevoEstado: EstadoUnidadSerial): Promise<void>
}

export class SupabaseUnidadSerializadaRepository implements UnidadSerializadaRepository {
  async obtenerPorProducto(idProducto: number | string): Promise<UnidadSerializada[]> {
    const { data, error } = await supabase
      .from('unidad_serializada')
      .select(`
        id_unidad,
        id_producto,
        numero_serie,
        id_etiqueta,
        id_almacen,
        estado,
        fecha_ingreso,
        etiqueta_rfid:etiqueta_rfid (
          id_etiqueta,
          uid_tag,
          estado
        ),
        almacen:almacen (
          id_almacen,
          nombre,
          prefijo_rfid
        )
      `)
      .eq('id_producto', idProducto)
      .order('fecha_ingreso', { ascending: false })

    if (error) {
      throw new Error(`Error al cargar unidades serializadas del producto ${idProducto}: ${error.message}`)
    }

    return (data ?? []) as unknown as UnidadSerializada[]
  }

  async obtenerPorId(idUnidad: number | string): Promise<UnidadSerializada | null> {
    const { data, error } = await supabase
      .from('unidad_serializada')
      .select(`
        id_unidad,
        id_producto,
        numero_serie,
        id_etiqueta,
        id_almacen,
        estado,
        fecha_ingreso,
        etiqueta_rfid:etiqueta_rfid (
          id_etiqueta,
          uid_tag,
          estado
        ),
        almacen:almacen (
          id_almacen,
          nombre,
          prefijo_rfid
        )
      `)
      .eq('id_unidad', idUnidad)
      .maybeSingle()

    if (error) {
      throw new Error(`Error al buscar unidad serializada ${idUnidad}: ${error.message}`)
    }

    return (data ?? null) as unknown as UnidadSerializada | null
  }

  async guardar(unidad: Partial<UnidadSerializada>): Promise<UnidadSerializada> {
    const payload = {
      id_producto: Number(unidad.id_producto),
      numero_serie: unidad.numero_serie?.trim(),
      id_etiqueta: unidad.id_etiqueta ? Number(unidad.id_etiqueta) : null,
      id_almacen: unidad.id_almacen ? Number(unidad.id_almacen) : null,
      estado: unidad.estado || 'DISPONIBLE'
    }

    if (unidad.id_unidad) {
      const { data, error } = await supabase
        .from('unidad_serializada')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id_unidad', unidad.id_unidad)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al actualizar unidad serializada: ${error.message}`)
      }

      return data as unknown as UnidadSerializada
    } else {
      const { data, error } = await supabase
        .from('unidad_serializada')
        .insert(payload)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al crear unidad serializada: ${error.message}`)
      }

      return data as unknown as UnidadSerializada
    }
  }

  async cambiarEstado(idUnidad: number | string, nuevoEstado: EstadoUnidadSerial): Promise<void> {
    const { error } = await supabase
      .from('unidad_serializada')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id_unidad', idUnidad)

    if (error) {
      throw new Error(`Error al cambiar estado de unidad serializada ${idUnidad}: ${error.message}`)
    }
  }
}

export const unidadSerializadaRepository = new SupabaseUnidadSerializadaRepository()
