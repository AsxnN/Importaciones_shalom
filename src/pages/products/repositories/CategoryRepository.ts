import { supabase } from '../../../lib/supabase'
import type { Category, ModoManejo } from '../types'

export interface CategoriaRepository {
  obtenerTodas(): Promise<Category[]>
  obtenerModosManejo(): Promise<ModoManejo[]>
  guardar(categoria: Partial<Category>): Promise<Category>
  cambiarEstado(idCategoria: number | string, activo: boolean): Promise<void>
}

const MODOS_DEFAULT: ModoManejo[] = [
  {
    codigo: 'PALETIZADO',
    nombre: 'Paletizado estándar',
    descripcion: 'Carga organizada en cajas y estibas paletizadas con regla de empaque',
    requiere_regla_empaque: true,
    requiere_serie: false,
    permite_puchos: true,
    activo: true
  },
  {
    codigo: 'SERIALIZADO',
    nombre: 'Serializado unitario',
    descripcion: 'Equipos y maquinaria identificados unitariamente por número de serie y RFID individual',
    requiere_regla_empaque: false,
    requiere_serie: true,
    permite_puchos: false,
    activo: true
  }
]

export class SupabaseCategoriaRepository implements CategoriaRepository {
  async obtenerTodas(): Promise<Category[]> {
    // Intento 1: con columna modo_manejo
    try {
      const { data, error } = await supabase
        .from('categoria')
        .select('id_categoria, nombre, descripcion, modo_manejo, activo')
        .order('nombre')

      if (!error && data) {
        return data as Category[]
      }
    } catch {
      // Ignorar y usar fallback
    }

    // Fallback: sin columna modo_manejo
    const { data, error } = await supabase
      .from('categoria')
      .select('id_categoria, nombre, descripcion, activo')
      .order('nombre')

    if (error) {
      throw new Error(`Error al cargar categorías: ${error.message}`)
    }

    return (data ?? []).map((c) => ({
      ...c,
      modo_manejo: 'PALETIZADO'
    })) as Category[]
  }

  async obtenerModosManejo(): Promise<ModoManejo[]> {
    try {
      const { data, error } = await supabase
        .from('modo_manejo')
        .select('codigo, nombre, descripcion, requiere_regla_empaque, requiere_serie, permite_puchos, activo')
        .order('codigo')

      if (!error && data && data.length > 0) {
        return data as ModoManejo[]
      }
    } catch {
      // Ignorar y devolver default
    }

    return MODOS_DEFAULT
  }

  async guardar(categoria: Partial<Category>): Promise<Category> {
    const payloadConModo: Record<string, unknown> = {
      nombre: categoria.nombre?.trim(),
      descripcion: categoria.descripcion?.trim() || null,
      modo_manejo: categoria.modo_manejo || 'PALETIZADO',
      activo: categoria.activo !== false
    }

    const payloadSinModo: Record<string, unknown> = {
      nombre: categoria.nombre?.trim(),
      descripcion: categoria.descripcion?.trim() || null,
      activo: categoria.activo !== false
    }

    // Intentar primero con modo_manejo
    try {
      if (categoria.id_categoria) {
        const { data, error } = await supabase
          .from('categoria')
          .update(payloadConModo)
          .eq('id_categoria', categoria.id_categoria)
          .select()
          .single()

        if (!error && data) {
          return data as Category
        }
      } else {
        const { data, error } = await supabase
          .from('categoria')
          .insert(payloadConModo)
          .select()
          .single()

        if (!error && data) {
          return data as Category
        }
      }
    } catch {
      // Fallback si la columna no existe
    }

    // Fallback sin columna modo_manejo
    if (categoria.id_categoria) {
      const { data, error } = await supabase
        .from('categoria')
        .update(payloadSinModo)
        .eq('id_categoria', categoria.id_categoria)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al actualizar categoría: ${error.message}`)
      }
      return { ...(data as Category), modo_manejo: 'PALETIZADO' }
    } else {
      const { data, error } = await supabase
        .from('categoria')
        .insert(payloadSinModo)
        .select()
        .single()

      if (error) {
        throw new Error(`Error al crear categoría: ${error.message}`)
      }
      return { ...(data as Category), modo_manejo: 'PALETIZADO' }
    }
  }

  async cambiarEstado(idCategoria: number | string, activo: boolean): Promise<void> {
    const { error } = await supabase
      .from('categoria')
      .update({ activo })
      .eq('id_categoria', idCategoria)

    if (error) {
      throw new Error(`Error al actualizar estado de categoría: ${error.message}`)
    }
  }
}

export const categoriaRepository = new SupabaseCategoriaRepository()
