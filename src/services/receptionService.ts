import { supabase } from '../lib/supabase'
import type {
  ConciliationResult,
  ImportOrder,
  ReceptionReadingItem,
  ReceptionReadingLog,
  ReceptionSession
} from '../types/receptions'

export interface WarehouseOption {
  id_almacen: number
  nombre: string
  tipo: string
  capacidad_m3: number
  activo: boolean
  prefijo_rfid?: string | null
}

export interface ProductOption {
  id_producto: number
  sku: string
  nombre: string
  descripcion?: string | null
  unidades_por_caja: number
  cajas_por_paleta: number
  peso_caja_kg?: number | null
}

export interface SupplierOption {
  id_proveedor: number
  nombre: string
  razon_social?: string | null
  contacto?: string | null
}

export const receptionService = {
  // 1. Obtener almacenes activos
  async getWarehouses(): Promise<WarehouseOption[]> {
    try {
      const { data, error } = await supabase
        .from('almacen')
        .select('id_almacen, nombre, tipo, capacidad_m3, activo, prefijo_rfid')
        .eq('activo', true)
        .order('id_almacen')

      if (error) throw error
      return (data as WarehouseOption[]) || []
    } catch {
      return []
    }
  },

  // 2. Obtener proveedores activos
  async getSuppliers(): Promise<SupplierOption[]> {
    try {
      const { data, error } = await supabase
        .from('proveedor')
        .select('id_proveedor, razon_social, calificacion_otif, tiempo_lead_time_dias, activo')
        .eq('activo', true)
        .order('razon_social')

      if (error) {
        console.error('Error fetching suppliers:', error)
        throw error
      }
      return (data || []).map((s: any) => ({
        id_proveedor: s.id_proveedor,
        nombre: s.razon_social,
        razon_social: s.razon_social
      }))
    } catch (err) {
      console.error('Exception in getSuppliers:', err)
      return []
    }
  },

  // 3. Obtener productos activos con regla de empaque calculada
  async getActiveProducts(): Promise<ProductOption[]> {
    try {
      const { data, error } = await supabase
        .from('producto')
        .select(`
          id_producto,
          sku,
          nombre,
          descripcion,
          regla_empaque (
            unidades_por_caja,
            cajas_por_camada,
            numero_camadas,
            cajas_por_camita,
            camitas_por_paleta,
            peso_caja_kg
          )
        `)
        .eq('activo', true)
        .order('sku')

      if (error) throw error

      return (data || []).map((p: any) => {
        const rawRegla = Array.isArray(p.regla_empaque) ? p.regla_empaque[0] : p.regla_empaque
        const unidCaja = rawRegla?.unidades_por_caja || 1
        let cajasPaleta = 1

        if (rawRegla?.cajas_por_camada && rawRegla?.numero_camadas) {
          cajasPaleta = rawRegla.cajas_por_camada * rawRegla.numero_camadas
        } else if (rawRegla?.cajas_por_camita && rawRegla?.camitas_por_paleta) {
          cajasPaleta = rawRegla.cajas_por_camita * rawRegla.camitas_por_paleta
        }

        return {
          id_producto: p.id_producto,
          sku: p.sku,
          nombre: p.nombre,
          descripcion: p.descripcion,
          unidades_por_caja: unidCaja,
          cajas_por_paleta: Math.max(1, cajasPaleta),
          peso_caja_kg: rawRegla?.peso_caja_kg || null
        }
      })
    } catch {
      return []
    }
  },

  // 4. Obtener órdenes de importación disponibles para recepción
  async getImportOrders(filterStatus?: 'ALL' | 'PENDING'): Promise<ImportOrder[]> {
    try {
      let query = supabase
        .from('orden_importacion')
        .select(`
          id_orden,
          numero_orden,
          id_proveedor,
          estado,
          fecha_emision,
          tipo_contenedor,
          volumen_ocupado_m3,
          proveedor ( id_proveedor, razon_social ),
          detalle_orden (
            id_detalle,
            id_orden,
            id_producto,
            cantidad_pedida,
            subtotal_peso_kg,
            subtotal_volumen_m3,
            producto (
              id_producto,
              sku,
              nombre,
              regla_empaque (
                unidades_por_caja,
                cajas_por_camada,
                numero_camadas,
                cajas_por_camita,
                camitas_por_paleta,
                peso_caja_kg
              )
            )
          )
        `)
        .order('fecha_emision', { ascending: false })

      if (filterStatus === 'PENDING') {
        query = query.in('estado', ['TRANSITO', 'BORRADOR'])
      }

      const { data, error } = await query
      if (error) throw error

      return (data || []).map((ord: any) => ({
        id_orden: ord.id_orden,
        numero_orden: ord.numero_orden,
        id_proveedor: ord.id_proveedor,
        estado: ord.estado,
        fecha_emision: ord.fecha_emision,
        tipo_contenedor: ord.tipo_contenedor,
        volumen_ocupado_m3: ord.volumen_ocupado_m3,
        proveedor: ord.proveedor
          ? {
              id_proveedor: ord.proveedor.id_proveedor,
              razon_social: ord.proveedor.razon_social,
              nombre: ord.proveedor.razon_social
            }
          : null,
        detalles: (ord.detalle_orden || []).map((det: any) => {
          const rawRegla = Array.isArray(det.producto?.regla_empaque)
            ? det.producto?.regla_empaque[0]
            : det.producto?.regla_empaque

          let cajasPaleta = 1
          if (rawRegla?.cajas_por_camada && rawRegla?.numero_camadas) {
            cajasPaleta = rawRegla.cajas_por_camada * rawRegla.numero_camadas
          } else if (rawRegla?.cajas_por_camita && rawRegla?.camitas_por_paleta) {
            cajasPaleta = rawRegla.cajas_por_camita * rawRegla.camitas_por_paleta
          }

          return {
            id_detalle: det.id_detalle,
            id_orden: det.id_orden,
            id_producto: det.id_producto,
            cantidad_pedida: det.cantidad_pedida,
            subtotal_peso_kg: det.subtotal_peso_kg,
            subtotal_volumen_m3: det.subtotal_volumen_m3,
            producto: det.producto
              ? {
                  id_producto: det.producto.id_producto,
                  sku: det.producto.sku,
                  nombre: det.producto.nombre,
                  regla_empaque: rawRegla
                    ? {
                        ...rawRegla,
                        cajas_por_paleta: Math.max(1, cajasPaleta)
                      }
                    : null
                }
              : null
          }
        })
      }))
    } catch {
      return []
    }
  },

  // 5. Crear una nueva orden de importación con su detalle
  async createImportOrder(payload: {
    numero_orden: string
    id_proveedor?: number | null
    tipo_contenedor?: '20FT' | '40FT' | 'LCL'
    items: Array<{ id_producto: number; cantidad_pedida: number }>
  }): Promise<{ success: boolean; id_orden?: number; error?: string }> {
    try {
      // Validar si el número de orden ya existe
      const { data: existing } = await supabase
        .from('orden_importacion')
        .select('id_orden')
        .eq('numero_orden', payload.numero_orden.trim())
        .maybeSingle()

      if (existing) {
        return { success: false, error: `La orden "${payload.numero_orden}" ya existe en el sistema.` }
      }

      // Insertar cabecera de la orden en estado 'TRANSITO'
      const { data: ordData, error: ordErr } = await supabase
        .from('orden_importacion')
        .insert({
          numero_orden: payload.numero_orden.trim().toUpperCase(),
          id_proveedor: payload.id_proveedor || null,
          estado: 'TRANSITO',
          fecha_emision: new Date().toISOString().split('T')[0],
          tipo_contenedor: payload.tipo_contenedor || '40FT'
        })
        .select('id_orden')
        .single()

      if (ordErr || !ordData) {
        return { success: false, error: ordErr?.message || 'No se pudo crear la orden de importación.' }
      }

      const idOrden = ordData.id_orden

      // Insertar detalles de la orden
      const detailInserts = payload.items.map((item) => ({
        id_orden: idOrden,
        id_producto: item.id_producto,
        cantidad_pedida: item.cantidad_pedida
      }))

      const { error: detErr } = await supabase.from('detalle_orden').insert(detailInserts)
      if (detErr) {
        return { success: false, error: `Orden creada (ID ${idOrden}), pero falló el detalle: ${detErr.message}` }
      }

      return { success: true, id_orden: idOrden }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error inesperado al crear orden.' }
    }
  },

  // 6. Sugerir siguiente UID correlativo para el almacén (rellenando huecos de menor a mayor)
  async suggestNextUid(warehouseId: number, prefix?: string, excludeUids: string[] = []): Promise<string> {
    try {
      let cleanPref = prefix?.trim().toUpperCase()
      if (!cleanPref) {
        const { data: wh } = await supabase
          .from('almacen')
          .select('prefijo_rfid')
          .eq('id_almacen', warehouseId)
          .maybeSingle()
        if (wh?.prefijo_rfid) cleanPref = wh.prefijo_rfid.trim().toUpperCase()
      }
      cleanPref = cleanPref || `ALM${warehouseId}`

      // Conjunto de números ocupados (de la BD y de la sesión activa en curso)
      const occupied = new Set<number>()

      // 1. Tags escaneados en la sesión actual
      for (const u of excludeUids) {
        const cleanU = u.trim().toUpperCase()
        if (cleanU.startsWith(cleanPref)) {
          const numStr = cleanU.slice(cleanPref.length).replace(/\D/g, '')
          if (numStr) occupied.add(parseInt(numStr, 10))
        }
      }

      // 2. Tags activos en Supabase con este prefijo
      const { data: dbTags } = await supabase
        .from('etiqueta_rfid')
        .select('uid_tag, estado')
        .ilike('uid_tag', `${cleanPref}%`)

      if (dbTags) {
        for (const t of dbTags) {
          if (t.estado === 'ACTIVA') {
            const numStr = t.uid_tag.slice(cleanPref.length).replace(/\D/g, '')
            if (numStr) occupied.add(parseInt(numStr, 10))
          }
        }
      }

      // 3. Buscar de menor a mayor el primer hueco disponible (N = 1, 2, 3...)
      let nextNum = 1
      while (occupied.has(nextNum)) {
        nextNum++
      }

      return `${cleanPref}${nextNum.toString().padStart(5, '0')}`
    } catch {
      const fallbackPref = prefix || `ALM${warehouseId}`
      return `${fallbackPref}00001`
    }
  },

  // 7. Validar disponibilidad de un Tag UID
  async checkTagAvailability(
    uid: string,
    currentSessionTags: string[],
    expectedProductId: number
  ): Promise<{ valid: boolean; reason?: string }> {
    const cleanUid = uid.trim().toUpperCase()
    if (!cleanUid) {
      return { valid: false, reason: 'El identificador UID no puede estar vacío.' }
    }

    // A. Duplicado en la sesión actual
    if (currentSessionTags.map((t) => t.toUpperCase()).includes(cleanUid)) {
      return { valid: false, reason: `El tag "${cleanUid}" ya fue escaneado en esta sesión.` }
    }

    // B. Verificación contra base de datos
    try {
      const { data, error } = await supabase
        .from('etiqueta_rfid')
        .select('id_etiqueta, id_producto, estado, producto ( sku, nombre )')
        .eq('uid_tag', cleanUid)
        .maybeSingle()

      if (!error && data) {
        const prod = data.producto as any
        if (data.id_producto !== expectedProductId && data.estado === 'ACTIVA') {
          return {
            valid: false,
            reason: `El tag "${cleanUid}" ya está asignado al producto ${prod?.sku || `ID ${data.id_producto}`} en estado ACTIVO.`
          }
        }
      }
    } catch {
      // Continuar si la red no responde
    }

    return { valid: true }
  },

  // 8. Enviar recepción y conciliar ciegamente mediante la RPC 'conciliar_recepcion'
  async submitConciliation(payload: {
    id_orden: number
    id_producto: number
    id_almacen: number
    lecturas: ReceptionReadingItem[]
    offlineTransactionId?: string
  }): Promise<ConciliationResult> {
    if (!payload.lecturas || payload.lecturas.length === 0) {
      throw new Error('Debe escanear al menos un tag para conciliar la recepción.')
    }

    // Preparar el arreglo JSON para la función RPC
    const pLecturas = payload.lecturas.map((item) => ({
      uid: item.uid.trim(),
      tipo: item.tipo,
      cantidad_paquetes: item.cantidad_paquetes
    }))

    // Invocación a la RPC 'conciliar_recepcion'
    const { data, error } = await supabase.rpc('conciliar_recepcion', {
      p_id_orden: payload.id_orden,
      p_id_producto: payload.id_producto,
      p_id_almacen: payload.id_almacen,
      p_lecturas: pLecturas,
      p_id_transaccion_offline: payload.offlineTransactionId || null
    })

    if (error) {
      throw new Error(error.message || 'Error ejecutando conciliar_recepcion en la base de datos.')
    }

    const res = data as ConciliationResult

    // Asegurar que las etiquetas recién enroladas queden asignadas a la Zona Campo del almacén
    // para que aparezcan visibles en el plano de inventario inmediatamente
    try {
      const uids = payload.lecturas.map((l) => l.uid.trim())

      // Buscar celda CAMPO del almacén
      const { data: campoCell } = await supabase
        .from('celda_rack')
        .select('id_celda')
        .eq('id_almacen', payload.id_almacen)
        .eq('tipo_ubicacion', 'CAMPO')
        .maybeSingle()

      if (campoCell) {
        await supabase
          .from('etiqueta_rfid')
          .update({
            id_celda: campoCell.id_celda,
            notas: 'ZONA_CAMPO'
          })
          .in('uid_tag', uids)
          .is('id_celda', null)
      }
    } catch {
      // No bloquear la conciliación si la asignación secundaria a celda falla
    }

    // Marcar la orden de importación como RECIBIDA para que quede cerrada y no se vuelva a usar
    try {
      await supabase
        .from('orden_importacion')
        .update({ estado: 'RECIBIDA' })
        .eq('id_orden', payload.id_orden)
    } catch {
      // Continuar si la orden ya fue cerrada previamente
    }

    return res
  },

  // 9. Obtener historial de sesiones de recepción
  async getReceptionHistory(warehouseId?: number): Promise<ReceptionSession[]> {
    try {
      let query = supabase
        .from('sesion_recepcion')
        .select(`
          id_sesion,
          id_orden,
          id_producto,
          id_almacen,
          id_usuario,
          estado,
          total_paletas_completas,
          total_paquetes_puchos,
          id_transaccion_offline,
          fecha_inicio,
          fecha_finalizacion,
          orden_importacion (
            numero_orden,
            id_proveedor,
            proveedor ( id_proveedor, razon_social )
          ),
          producto ( sku, nombre ),
          almacen ( nombre, tipo, prefijo_rfid ),
          usuario ( nombre_completo, correo ),
          conciliacion_ciega (
            id_conciliacion,
            fecha_cruce,
            tags_esperados,
            tags_leidos,
            total_paletas_completas,
            total_paquetes_puchos,
            estado
          )
        `)
        .order('fecha_inicio', { ascending: false })

      if (warehouseId) {
        query = query.eq('id_almacen', warehouseId)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error in getReceptionHistory query:', error)
        throw error
      }

      return (data || []).map((s: any) => {
        const rawConcil = Array.isArray(s.conciliacion_ciega)
          ? s.conciliacion_ciega[0]
          : s.conciliacion_ciega

        return {
          id_sesion: s.id_sesion,
          id_orden: s.id_orden,
          id_producto: s.id_producto,
          id_almacen: s.id_almacen,
          id_usuario: s.id_usuario,
          estado: s.estado,
          total_paletas_completas: s.total_paletas_completas,
          total_paquetes_puchos: s.total_paquetes_puchos,
          id_transaccion_offline: s.id_transaccion_offline,
          fecha_inicio: s.fecha_inicio,
          fecha_finalizacion: s.fecha_finalizacion,
          orden: s.orden_importacion
            ? {
                numero_orden: s.orden_importacion.numero_orden,
                id_proveedor: s.orden_importacion.id_proveedor,
                proveedor: s.orden_importacion.proveedor
                  ? {
                      nombre: s.orden_importacion.proveedor.razon_social,
                      razon_social: s.orden_importacion.proveedor.razon_social
                    }
                  : null
              }
            : null,
          producto: s.producto,
          almacen: s.almacen,
          usuario: s.usuario
            ? {
                nombre_completo: s.usuario.nombre_completo,
                correo: s.usuario.correo,
                email: s.usuario.correo
              }
            : null,
          conciliacion: rawConcil || null
        }
      })
    } catch (err) {
      console.error('Exception in getReceptionHistory:', err)
      return []
    }
  },

  // 10. Obtener detalle de lecturas de una sesión específica
  async getReceptionReadings(sessionId: number): Promise<ReceptionReadingLog[]> {
    try {
      const { data, error } = await supabase
        .from('recepcion_lectura')
        .select(`
          id_lectura,
          id_sesion,
          id_etiqueta,
          uid_tag,
          tipo_carga,
          cantidad_paquetes,
          cantidad_unidades,
          leido_en,
          valido,
          motivo_invalidez
        `)
        .eq('id_sesion', sessionId)
        .order('id_lectura', { ascending: true })

      if (error) throw error
      return (data as ReceptionReadingLog[]) || []
    } catch {
      return []
    }
  }
}
