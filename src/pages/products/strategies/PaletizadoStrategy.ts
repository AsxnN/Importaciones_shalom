import { supabase } from '../../../lib/supabase'
import { getProductRule, type PackingFormData, type Product } from '../types'
import type { EstrategiaManejo } from './EstrategiaManejo'

export class PaletizadoStrategy implements EstrategiaManejo<PackingFormData> {
  readonly codigoModo = 'PALETIZADO'
  readonly nombre = 'Paletizado estándar'
  readonly descripcion = 'Carga organizada en cajas y estibas paletizadas con regla de empaque'
  readonly requiereReglaEmpaque = true
  readonly requiereSerie = false
  readonly permitePuchos = true

  obtenerValoresPorDefecto(): PackingFormData {
    return {
      unidades_por_caja: '1',
      cajas_por_camada: '1',
      numero_camadas: '1',
      permite_puchos: true,
      notas_armado: '',
      largo_caja_cm: '',
      ancho_caja_cm: '',
      alto_caja_cm: '',
      peso_caja_kg: ''
    }
  }

  mapearDesdeProducto(producto: Product): PackingFormData {
    const rule = getProductRule(producto)
    if (!rule) {
      return this.obtenerValoresPorDefecto()
    }

    return {
      unidades_por_caja: String(rule.unidades_por_caja ?? 1),
      cajas_por_camada: String(rule.cajas_por_camada ?? rule.cajas_por_camita ?? 1),
      numero_camadas: String(rule.numero_camadas ?? rule.camitas_por_paleta ?? 1),
      permite_puchos: rule.permite_puchos ?? true,
      notas_armado: rule.notas_armado ?? '',
      largo_caja_cm: rule.largo_caja_cm ? String(rule.largo_caja_cm) : '',
      ancho_caja_cm: rule.ancho_caja_cm ? String(rule.ancho_caja_cm) : '',
      alto_caja_cm: rule.alto_caja_cm ? String(rule.alto_caja_cm) : '',
      peso_caja_kg: rule.peso_caja_kg ? String(rule.peso_caja_kg) : ''
    }
  }

  validar(datos: PackingFormData): { valido: boolean; errores: string[] } {
    const errores: string[] = []
    const uCaja = Number(datos.unidades_por_caja)
    const cCamada = Number(datos.cajas_por_camada)
    const nCamadas = Number(datos.numero_camadas)

    if (isNaN(uCaja) || uCaja <= 0) {
      errores.push('Las unidades por caja deben ser un número mayor a 0.')
    }
    if (isNaN(cCamada) || cCamada <= 0) {
      errores.push('Las cajas por camada deben ser un número mayor a 0.')
    }
    if (isNaN(nCamadas) || nCamadas <= 0) {
      errores.push('El número de camadas debe ser un número mayor a 0.')
    }

    return {
      valido: errores.length === 0,
      errores
    }
  }

  async guardarPerfil(
    idProducto: number | string,
    datos: PackingFormData,
    imagenFile?: File | null
  ): Promise<void> {
    const validacion = this.validar(datos)
    if (!validacion.valido) {
      throw new Error(validacion.errores.join(' '))
    }

    const cCamada = Math.max(1, Number(datos.cajas_por_camada) || 1)
    const nCamadas = Math.max(1, Number(datos.numero_camadas) || 1)
    const uCaja = Math.max(1, Number(datos.unidades_por_caja) || 1)
    const l = Number(datos.largo_caja_cm) || null
    const w = Number(datos.ancho_caja_cm) || null
    const h = Number(datos.alto_caja_cm) || null
    const pCaja = Number(datos.peso_caja_kg) || null

    const cajasPaleta = cCamada * nCamadas
    const volCajaM3 = l && w && h ? (l * w * h) / 1000000 : null
    const volPaletaM3 = volCajaM3 ? volCajaM3 * cajasPaleta : null

    let imagePath: string | null = null
    if (imagenFile) {
      const ext = imagenFile.name.split('.').pop() || 'png'
      const fileName = `patrones/${idProducto}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('esquemas-empaque')
        .upload(fileName, imagenFile, { upsert: true })

      if (uploadErr) {
        throw new Error(`Error al subir imagen de armado: ${uploadErr.message}`)
      }
      imagePath = fileName
    }

    const payload: Record<string, unknown> = {
      id_producto: Number(idProducto),
      unidades_por_caja: uCaja,
      cajas_por_camada: cCamada,
      numero_camadas: nCamadas,
      permite_puchos: datos.permite_puchos,
      largo_caja_cm: l,
      ancho_caja_cm: w,
      alto_caja_cm: h,
      peso_caja_kg: pCaja,
      volumen_caja_m3: volCajaM3,
      volumen_total_m3: volPaletaM3,
      notas_armado: datos.notas_armado.trim() || null
    }

    if (imagePath) {
      payload.imagen_armado_path = imagePath
    }

    const { error } = await supabase
      .from('regla_empaque')
      .upsert(payload, { onConflict: 'id_producto' })

    if (error) {
      throw new Error(`Error al guardar regla de empaque: ${error.message}`)
    }
  }

  async eliminarPerfil(idProducto: number | string): Promise<void> {
    const { error } = await supabase
      .from('regla_empaque')
      .delete()
      .eq('id_producto', idProducto)

    if (error) {
      throw new Error(`Error al eliminar regla de empaque: ${error.message}`)
    }
  }
}

export const paletizadoStrategy = new PaletizadoStrategy()
