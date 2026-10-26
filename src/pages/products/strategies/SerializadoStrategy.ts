import { supabase } from '../../../lib/supabase'
import { getProductSerialProfile, type Product, type SerializedFormData } from '../types'
import type { EstrategiaManejo } from './EstrategiaManejo'

export class SerializadoStrategy implements EstrategiaManejo<SerializedFormData> {
  readonly codigoModo = 'SERIALIZADO'
  readonly nombre = 'Serializado unitario'
  readonly descripcion = 'Equipos y maquinaria identificados unitariamente por número de serie y RFID individual'
  readonly requiereReglaEmpaque = false
  readonly requiereSerie = true
  readonly permitePuchos = false

  obtenerValoresPorDefecto(): SerializedFormData {
    return {
      peso_unitario_kg: '',
      largo_cm: '',
      ancho_cm: '',
      alto_cm: '',
      requiere_equipo_izaje: false,
      ubicacion_permitida: 'AMBAS',
      atributos: {},
      notas: ''
    }
  }

  mapearDesdeProducto(producto: Product): SerializedFormData {
    const profile = getProductSerialProfile(producto)
    if (!profile) {
      return {
        ...this.obtenerValoresPorDefecto(),
        peso_unitario_kg: producto.peso_unitario_kg ? String(producto.peso_unitario_kg) : ''
      }
    }

    return {
      peso_unitario_kg: profile.peso_unitario_kg ? String(profile.peso_unitario_kg) : '',
      largo_cm: profile.largo_cm ? String(profile.largo_cm) : '',
      ancho_cm: profile.ancho_cm ? String(profile.ancho_cm) : '',
      alto_cm: profile.alto_cm ? String(profile.alto_cm) : '',
      requiere_equipo_izaje: profile.requiere_equipo_izaje ?? false,
      ubicacion_permitida: profile.ubicacion_permitida || 'AMBAS',
      atributos: profile.atributos || {},
      notas: profile.notas ?? ''
    }
  }

  validar(datos: SerializedFormData): { valido: boolean; errores: string[] } {
    const errores: string[] = []

    if (datos.peso_unitario_kg) {
      const p = Number(datos.peso_unitario_kg)
      if (isNaN(p) || p <= 0) {
        errores.push('El peso unitario debe ser un valor numérico positivo.')
      }
    }

    if (datos.largo_cm) {
      const l = Number(datos.largo_cm)
      if (isNaN(l) || l <= 0) {
        errores.push('El largo (cm) debe ser un valor numérico positivo.')
      }
    }

    if (datos.ancho_cm) {
      const w = Number(datos.ancho_cm)
      if (isNaN(w) || w <= 0) {
        errores.push('El ancho (cm) debe ser un valor numérico positivo.')
      }
    }

    if (datos.alto_cm) {
      const h = Number(datos.alto_cm)
      if (isNaN(h) || h <= 0) {
        errores.push('El alto (cm) debe ser un valor numérico positivo.')
      }
    }

    if (!['CAMPO', 'RACK', 'AMBAS'].includes(datos.ubicacion_permitida)) {
      errores.push('La ubicación permitida debe ser CAMPO, RACK o AMBAS.')
    }

    return {
      valido: errores.length === 0,
      errores
    }
  }

  async guardarPerfil(
    idProducto: number | string,
    datos: SerializedFormData
  ): Promise<void> {
    const validacion = this.validar(datos)
    if (!validacion.valido) {
      throw new Error(validacion.errores.join(' '))
    }

    const payload = {
      id_producto: Number(idProducto),
      peso_unitario_kg: datos.peso_unitario_kg ? Number(datos.peso_unitario_kg) : null,
      largo_cm: datos.largo_cm ? Number(datos.largo_cm) : null,
      ancho_cm: datos.ancho_cm ? Number(datos.ancho_cm) : null,
      alto_cm: datos.alto_cm ? Number(datos.alto_cm) : null,
      requiere_equipo_izaje: datos.requiere_equipo_izaje === true,
      ubicacion_permitida: datos.ubicacion_permitida || 'AMBAS',
      atributos: datos.atributos || {},
      notas: datos.notas.trim() || null,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('perfil_serializado')
      .upsert(payload, { onConflict: 'id_producto' })

    if (error) {
      throw new Error(`Error al guardar perfil serializado: ${error.message}`)
    }
  }

  async eliminarPerfil(idProducto: number | string): Promise<void> {
    const { error } = await supabase
      .from('perfil_serializado')
      .delete()
      .eq('id_producto', idProducto)

    if (error) {
      throw new Error(`Error al eliminar perfil serializado: ${error.message}`)
    }
  }
}

export const serializadoStrategy = new SerializadoStrategy()
