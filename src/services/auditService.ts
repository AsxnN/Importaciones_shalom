import { supabase } from '../lib/supabase'
import type { AuditSession, PalletAuditReading, ProductAuditItem, ScanMethod } from '../types/audits'
import { locationService } from './locationService'

const AUDIT_STORAGE_PREFIX = 'shalom_wms_audit_'

export const auditService = {
  // Obtener historial de auditorías
  async getAuditHistory(warehouseId?: number): Promise<AuditSession[]> {
    try {
      let query = supabase
        .from('auditoria_sesion')
        .select(`
          id_auditoria,
          id_almacen,
          fecha_inicio,
          fecha_fin,
          estado,
          total_productos,
          productos_auditados,
          paletas_esperadas,
          paletas_auditadas,
          porcentaje_eri,
          observaciones,
          almacen ( nombre ),
          usuario ( nombre_completo )
        `)
        .order('fecha_inicio', { ascending: false })

      if (warehouseId) {
        query = query.eq('id_almacen', warehouseId)
      }

      const { data, error } = await query

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id_auditoria: d.id_auditoria,
          id_almacen: d.id_almacen,
          almacen_nombre: d.almacen?.nombre || `Almacén #${d.id_almacen}`,
          id_usuario: d.id_usuario,
          usuario_nombre: d.usuario?.nombre_completo || 'Operario/Auditor',
          fecha_inicio: d.fecha_inicio,
          fecha_fin: d.fecha_fin,
          estado: d.estado,
          total_productos: d.total_productos,
          productos_auditados: d.productos_auditados,
          paletas_esperadas: d.paletas_esperadas,
          paletas_auditadas: d.paletas_auditadas,
          porcentaje_eri: Number(d.porcentaje_eri || 0),
          observaciones: d.observaciones
        }))
      }
    } catch {
      // Usar local
    }

    return this.getLocalAuditHistory(warehouseId)
  },

  // Iniciar una nueva sesión de auditoría por producto
  async startAuditSession(
    warehouseId: number,
    warehouseName: string,
    userId?: number,
    userName?: string
  ): Promise<{
    session: AuditSession
    products: ProductAuditItem[]
    readings: PalletAuditReading[]
  }> {
    // 1. Obtener todas las paletas activas en este almacén con su ubicación
    const pallets = await locationService.getWarehousePallets(warehouseId)

    // Agrupar paletas por producto
    const productMap = new Map<number, { sku: string; nombre: string; count: number }>()
    for (const p of pallets) {
      const prodId = p.id_producto
      const curr = productMap.get(prodId) || {
        sku: p.producto?.sku || `SKU-${prodId}`,
        nombre: p.producto?.nombre || `Producto ${prodId}`,
        count: 0
      }
      curr.count += 1
      productMap.set(prodId, curr)
    }

    const auditId = Date.now()
    const nowIso = new Date().toISOString()

    const session: AuditSession = {
      id_auditoria: auditId,
      id_almacen: warehouseId,
      almacen_nombre: warehouseName,
      id_usuario: userId || null,
      usuario_nombre: userName || 'Auditor Logístico',
      fecha_inicio: nowIso,
      estado: 'EN_PROCESO',
      total_productos: productMap.size,
      productos_auditados: 0,
      paletas_esperadas: pallets.length,
      paletas_auditadas: 0,
      porcentaje_eri: 0,
      observaciones: null
    }

    const products: ProductAuditItem[] = []
    let prodCounter = 1
    for (const [prodId, info] of productMap.entries()) {
      products.push({
        id_auditoria_prod: auditId * 100 + prodCounter++,
        id_auditoria: auditId,
        id_producto: prodId,
        sku: info.sku,
        nombre: info.nombre,
        paletas_esperadas: info.count,
        paletas_leidas: 0,
        estado: 'PENDIENTE',
        nota_confirmacion: null,
        fecha_confirmacion: null
      })
    }

    const readings: PalletAuditReading[] = pallets.map((p, idx) => {
      const prodItem = products.find((prod) => prod.id_producto === p.id_producto)
      return {
        id_lectura: auditId * 1000 + (idx + 1),
        id_auditoria: auditId,
        id_auditoria_prod: prodItem?.id_auditoria_prod || 0,
        id_etiqueta: p.id_etiqueta,
        uid_tag: p.uid_tag,
        codigo_barras: p.codigo_barras,
        id_producto: p.id_producto,
        sku: p.producto?.sku || 'SKU',
        nombre: p.producto?.nombre || 'Producto',
        id_celda: p.id_celda,
        codigo_ubicacion_esperada: p.codigo_ubicacion || (p.tipo_ubicacion === 'CAMPO' ? `ALM${warehouseId}-CAMPO` : 'SIN ASIGNAR'),
        tipo_ubicacion: p.tipo_ubicacion || 'RACK',
        tipo_paleta: p.tipo_paleta,
        cantidad_paquetes: p.cantidad_paquetes,
        cantidad_actual: p.cantidad_actual,
        leido: false,
        metodo_lectura: null,
        fecha_lectura: null
      }
    })

    // Guardar sesión activa localmente
    this.saveActiveSession(session, products, readings)
    return { session, products, readings }
  },

  // Registrar escaneo de paleta (RFID NFC o Código de Barras)
  async recordScan(
    auditId: number,
    productId: number,
    scanCode: string,
    method: ScanMethod
  ): Promise<{
    reading: PalletAuditReading | null
    product: ProductAuditItem | null
    allScannedForProduct: boolean
  }> {
    const active = this.loadActiveSession(auditId)
    if (!active) {
      throw new Error('Sesión de auditoría no encontrada o inactiva.')
    }

    const cleanCode = scanCode.trim().toUpperCase()

    // Buscar lectura correspondiente a este producto por RFID o Código de Barras
    const reading = active.readings.find(
      (r) =>
        r.id_producto === productId &&
        (r.uid_tag.toUpperCase() === cleanCode ||
          (r.codigo_barras && r.codigo_barras.toUpperCase() === cleanCode))
    )

    if (!reading) {
      return { reading: null, product: null, allScannedForProduct: false }
    }

    // Marcar como leído
    reading.leido = true
    reading.metodo_lectura = method
    reading.fecha_lectura = new Date().toISOString()

    // Actualizar conteo del producto
    const product = active.products.find((p) => p.id_producto === productId)
    if (product) {
      const prodReadings = active.readings.filter((r) => r.id_producto === productId)
      const scannedCount = prodReadings.filter((r) => r.leido).length
      product.paletas_leidas = scannedCount
    }

    // Actualizar totales de la sesión
    active.session.paletas_auditadas = active.readings.filter((r) => r.leido).length

    const prodReadings = active.readings.filter((r) => r.id_producto === productId)
    const allScannedForProduct = prodReadings.every((r) => r.leido)

    this.saveActiveSession(active.session, active.products, active.readings)
    return { reading, product: product || null, allScannedForProduct }
  },

  // Confirmar y cerrar un producto con su nota obligatoria
  async confirmProductAudit(
    auditId: number,
    productId: number,
    confirmationNote: string
  ): Promise<ProductAuditItem> {
    const active = this.loadActiveSession(auditId)
    if (!active) throw new Error('Sesión de auditoría no encontrada.')

    const product = active.products.find((p) => p.id_producto === productId)
    if (!product) throw new Error('Producto no encontrado en la auditoría.')

    product.estado = 'AUDITADO'
    product.nota_confirmacion = confirmationNote.trim()
    product.fecha_confirmacion = new Date().toISOString()

    // Recalcular productos auditados
    active.session.productos_auditados = active.products.filter((p) => p.estado === 'AUDITADO').length
    active.session.porcentaje_eri = active.session.total_productos > 0
      ? Number(((active.session.productos_auditados / active.session.total_productos) * 100).toFixed(1))
      : 100

    this.saveActiveSession(active.session, active.products, active.readings)
    return product
  },

  // Guardar y Finalizar Auditoría (completa o parcial)
  async finishAudit(
    auditId: number,
    observations?: string
  ): Promise<AuditSession> {
    const active = this.loadActiveSession(auditId)
    if (!active) throw new Error('Sesión no encontrada.')

    const allProductsAudited = active.products.every((p) => p.estado === 'AUDITADO')
    active.session.estado = allProductsAudited ? 'COMPLETADA' : 'PARCIAL'
    active.session.fecha_fin = new Date().toISOString()
    active.session.observaciones = observations?.trim() || (allProductsAudited ? 'Auditoría conforme sin novedades.' : 'Auditoría cerrada con productos pendientes.')
    active.session.porcentaje_eri = active.session.total_productos > 0
      ? Number(((active.session.productos_auditados / active.session.total_productos) * 100).toFixed(1))
      : 100

    // Guardar en histórico local
    const history = this.getLocalAuditHistory()
    const existingIndex = history.findIndex((h) => h.id_auditoria === auditId)
    if (existingIndex >= 0) {
      history[existingIndex] = active.session
    } else {
      history.unshift(active.session)
    }
    localStorage.setItem(`${AUDIT_STORAGE_PREFIX}history`, JSON.stringify(history))

    // Intentar persistir en Supabase
    try {
      await supabase.from('auditoria_sesion').insert({
        id_almacen: active.session.id_almacen,
        fecha_inicio: active.session.fecha_inicio,
        fecha_fin: active.session.fecha_fin,
        estado: active.session.estado,
        total_productos: active.session.total_productos,
        productos_auditados: active.session.productos_auditados,
        paletas_esperadas: active.session.paletas_esperadas,
        paletas_auditadas: active.session.paletas_auditadas,
        porcentaje_eri: active.session.porcentaje_eri,
        observaciones: active.session.observaciones
      })
    } catch {
      // Guardado local persistente
    }

    return active.session
  },

  // Métodos auxiliares de almacenamiento local
  loadActiveSession(auditId: number): {
    session: AuditSession
    products: ProductAuditItem[]
    readings: PalletAuditReading[]
  } | null {
    const raw = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}active_${auditId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  saveActiveSession(
    session: AuditSession,
    products: ProductAuditItem[],
    readings: PalletAuditReading[]
  ) {
    localStorage.setItem(
      `${AUDIT_STORAGE_PREFIX}active_${session.id_auditoria}`,
      JSON.stringify({ session, products, readings })
    )
  },

  getLocalAuditHistory(warehouseId?: number): AuditSession[] {
    const raw = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}history`)
    let list: AuditSession[] = []
    if (raw) {
      try {
        list = JSON.parse(raw)
      } catch {
        list = []
      }
    }

    if (list.length === 0) {
      // Historial demo representativo
      list = [
        {
          id_auditoria: 1718000000000,
          id_almacen: warehouseId || 1,
          almacen_nombre: 'Almacén Principal (Callao)',
          usuario_nombre: 'Carlos Ramos (Auditor)',
          fecha_inicio: '2026-10-10T14:30:00Z',
          fecha_fin: '2026-10-10T16:15:00Z',
          estado: 'COMPLETADA',
          total_productos: 2,
          productos_auditados: 2,
          paletas_esperadas: 3,
          paletas_auditadas: 3,
          porcentaje_eri: 100,
          observaciones: 'Auditoría cíclica semanal: todas las paletas en rack y campo verificadas conforme.'
        }
      ]
      localStorage.setItem(`${AUDIT_STORAGE_PREFIX}history`, JSON.stringify(list))
    }

    if (warehouseId) {
      return list.filter((a) => a.id_almacen === warehouseId)
    }
    return list
  }
}
