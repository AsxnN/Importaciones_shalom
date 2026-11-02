import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export interface PalletTagItem {
  bulto_numero: number
  uid_tag: string
  id_producto?: number
  sku: string
  nombre: string
  tipo: 'COMPLETO' | 'PUCHO' | 'RESERVA_EXCEDENTE'
  cajas: number
  unidades: number
  notas?: string
}

export interface ProductPackingSummary {
  id_producto: number
  sku: string
  nombre: string
  cantidad_pedida: number
  unidades_por_caja: number
  cajas_por_paleta: number
  unidades_por_paleta: number
  cajas_totales: number
  paletas_completas: number
  cajas_pucho: number
  unidades_pucho: number
  total_bultos: number
  paletas: PalletTagItem[]
}

export interface OrderPackingPlan {
  numero_orden: string
  contenedor: string
  proveedor: string
  fecha_emision: string
  prefijo_almacen: string
  total_unidades: number
  total_cajas: number
  total_paletas_completas: number
  total_puchos: number
  total_bultos_previstos: number
  productos: ProductPackingSummary[]
  etiquetas_bultos: PalletTagItem[]
  etiquetas_reserva: PalletTagItem[]
}

export const packingListService = {
  // 1. Obtener reglas de empaque enriquecidas de la base de datos
  async getProductsPackingRules(): Promise<Map<number, { unidades_por_caja: number; cajas_por_paleta: number }>> {
    const map = new Map<number, { unidades_por_caja: number; cajas_por_paleta: number }>()
    try {
      const { data, error } = await supabase
        .from('producto')
        .select(`
          id_producto,
          regla_empaque (
            unidades_por_caja,
            cajas_por_camada,
            numero_camadas,
            cajas_por_camita,
            camitas_por_paleta
          )
        `)

      if (!error && data) {
        for (const p of data) {
          const raw = Array.isArray(p.regla_empaque) ? p.regla_empaque[0] : p.regla_empaque
          const unidCaja = Number(raw?.unidades_por_caja) || 1
          let cajasPal = 1
          if (raw?.cajas_por_camada && raw?.numero_camadas) {
            cajasPal = Number(raw.cajas_por_camada) * Number(raw.numero_camadas)
          } else if (raw?.cajas_por_camita && raw?.camitas_por_paleta) {
            cajasPal = Number(raw.cajas_por_camita) * Number(raw.camitas_por_paleta)
          }
          map.set(p.id_producto, {
            unidades_por_caja: Math.max(1, unidCaja),
            cajas_por_paleta: Math.max(1, cajasPal)
          })
        }
      }
    } catch (err) {
      console.warn('No se pudo cargar regla_empaque remota, aplicando fallback 1:1', err)
    }
    return map
  },

  // 2. Obtener lote de tags correlativos disponibles con el prefijo dado (excluyendo tags físicos y pre-asignados a otras órdenes)
  async getAvailableTagBatch(prefix: string, countNeeded: number, currentOrderNumber?: string): Promise<string[]> {
    const cleanPrefix = (prefix || 'IMP').trim().toUpperCase()
    const occupied = new Set<number>()

    try {
      // A. Tags físicamente activos en etiqueta_rfid
      const { data: tags } = await supabase
        .from('etiqueta_rfid')
        .select('uid_tag, estado')
        .ilike('uid_tag', `${cleanPrefix}%`)

      if (tags && tags.length > 0) {
        for (const t of tags) {
          if (t.estado === 'ACTIVA') {
            const numStr = t.uid_tag.slice(cleanPrefix.length).replace(/\D/g, '')
            if (numStr) occupied.add(parseInt(numStr, 10))
          }
        }
      }

      // B. Tags ya separados y reservados en otras órdenes de importación activas (en tránsito o borrador)
      // 1. Revisar en localStorage primero
      try {
        const cachedRaw = localStorage.getItem('shalom_projection_orders_v1')
        if (cachedRaw) {
          const cachedOrders = JSON.parse(cachedRaw)
          if (Array.isArray(cachedOrders)) {
            for (const ord of cachedOrders) {
              if (currentOrderNumber && ord.numero_orden === currentOrderNumber) {
                continue
              }
              const plan = ord.snapshot_proyeccion?.packing_plan
              if (plan?.etiquetas_bultos && Array.isArray(plan.etiquetas_bultos)) {
                for (const item of plan.etiquetas_bultos) {
                  if (item.uid_tag && item.uid_tag.startsWith(cleanPrefix)) {
                    const numStr = item.uid_tag.slice(cleanPrefix.length).replace(/\D/g, '')
                    if (numStr) occupied.add(parseInt(numStr, 10))
                  }
                }
              }
              if (plan?.etiquetas_reserva && Array.isArray(plan.etiquetas_reserva)) {
                for (const item of plan.etiquetas_reserva) {
                  if (item.uid_tag && item.uid_tag.startsWith(cleanPrefix)) {
                    const numStr = item.uid_tag.slice(cleanPrefix.length).replace(/\D/g, '')
                    if (numStr) occupied.add(parseInt(numStr, 10))
                  }
                }
              }
            }
          }
        }
      } catch {
        // Ignorar error al leer de localStorage
      }

      // 2. Intentar consultar en Supabase si la columna existe
      try {
        const { data: orders } = await supabase
          .from('orden_importacion')
          .select('numero_orden')
          .in('estado', ['TRANSITO', 'BORRADOR'])

        if (orders && orders.length > 0) {
          // Órdenes activas en base de datos
        }
      } catch {
        // En caso de que falle la consulta remota
      }
    } catch (err) {
      console.warn('Error al verificar tags correlativos ocupados:', err)
    }

    const result: string[] = []
    let currentNum = 1
    while (result.length < countNeeded) {
      if (!occupied.has(currentNum)) {
        result.push(`${cleanPrefix}${currentNum.toString().padStart(5, '0')}`)
      }
      currentNum++
    }

    return result
  },

  // Guardar permanentemente el plan de paletizado en la orden para asegurar la separación de códigos
  async savePackingPlanToOrder(numeroOrden: string, plan: OrderPackingPlan): Promise<void> {
    // 1. Guardar en localStorage de órdenes para persistencia inmediata y confiable
    try {
      const cachedRaw = localStorage.getItem('shalom_projection_orders_v1')
      if (cachedRaw) {
        const cachedOrders = JSON.parse(cachedRaw)
        if (Array.isArray(cachedOrders)) {
          const idx = cachedOrders.findIndex((o: any) => o.numero_orden === numeroOrden)
          if (idx !== -1) {
            cachedOrders[idx].snapshot_proyeccion = {
              ...(cachedOrders[idx].snapshot_proyeccion || {}),
              packing_plan: plan
            }
            localStorage.setItem('shalom_projection_orders_v1', JSON.stringify(cachedOrders))
          }
        }
      }
    } catch {
      // Ignorar error de guardado en localStorage
    }

    // 2. Intentar guardar en Supabase si el esquema lo soporta
    try {
      const { data: ord } = await supabase
        .from('orden_importacion')
        .select('id_orden')
        .eq('numero_orden', numeroOrden)
        .maybeSingle()

      if (ord) {
        await (supabase.from('orden_importacion') as any)
          .update({
            snapshot_proyeccion: { packing_plan: plan }
          })
          .eq('id_orden', ord.id_orden)
      }
    } catch {
      // Ignorar si la columna remota no existe aún
    }
  },

  // 3. Generar el plan completo de packing list para una orden
  async generateOrderPackingPlan(
    order: {
      numero_orden: string
      tipo_contenedor?: string | null
      proveedor?: { razon_social?: string; nombre?: string } | null
      fecha_emision?: string
      snapshot_proyeccion?: any
      detalles?: Array<{
        id_producto: number
        cantidad_pedida: number
        producto?: { sku: string; nombre: string } | null
      }>
    },
    warehousePrefix: string = 'IMP'
  ): Promise<OrderPackingPlan> {
    // Si la orden ya cuenta con un plan de paletizado guardado previamente, reutilizar los códigos separados
    const existingPlan = order.snapshot_proyeccion?.packing_plan
    if (existingPlan && existingPlan.etiquetas_bultos && existingPlan.etiquetas_bultos.length > 0) {
      return existingPlan as OrderPackingPlan
    }

    const packingMap = await this.getProductsPackingRules()
    const detalles = order.detalles || []

    const summaries: ProductPackingSummary[] = []
    let totalBultosCount = 0

    // Primer paso: calcular descomposición por producto
    for (const d of detalles) {
      const idProd = d.id_producto
      const rule = packingMap.get(idProd) || { unidades_por_caja: 50, cajas_por_paleta: 48 }
      const cantidad = Number(d.cantidad_pedida) || 0
      if (cantidad <= 0) continue

      const unidCaja = rule.unidades_por_caja
      const cajasPal = rule.cajas_por_paleta
      const unidPal = unidCaja * cajasPal

      const cajasTotales = Math.ceil(cantidad / unidCaja)
      const paletasCompletas = Math.floor(cantidad / unidPal)
      const unidadesRestantes = cantidad % unidPal
      const cajasPucho = unidadesRestantes > 0 ? Math.ceil(unidadesRestantes / unidCaja) : 0
      const unidadesPucho = unidadesRestantes
      const bultosEsteProd = paletasCompletas + (cajasPucho > 0 ? 1 : 0)

      totalBultosCount += bultosEsteProd

      summaries.push({
        id_producto: idProd,
        sku: d.producto?.sku || `SKU-${idProd}`,
        nombre: d.producto?.nombre || 'Producto sin nombre',
        cantidad_pedida: cantidad,
        unidades_por_caja: unidCaja,
        cajas_por_paleta: cajasPal,
        unidades_por_paleta: unidPal,
        cajas_totales: cajasTotales,
        paletas_completas: paletasCompletas,
        cajas_pucho: cajasPucho,
        unidades_pucho: unidadesPucho,
        total_bultos: bultosEsteProd,
        paletas: []
      })
    }

    // Reservar buffer de contingencia: 5 códigos adicionales para posibles excedentes
    const contingencyCount = 5
    const totalTagsToGenerate = totalBultosCount + contingencyCount
    const generatedTags = await this.getAvailableTagBatch(warehousePrefix, totalTagsToGenerate, order.numero_orden)

    let tagIndex = 0
    let bultoSeq = 1
    const allPalletTags: PalletTagItem[] = []

    // Segundo paso: asignar códigos a cada paleta física
    for (const s of summaries) {
      // 1. Paletas completas
      for (let i = 0; i < s.paletas_completas; i++) {
        const tag = generatedTags[tagIndex++] || `${warehousePrefix}${bultoSeq.toString().padStart(5, '0')}`
        const item: PalletTagItem = {
          bulto_numero: bultoSeq++,
          uid_tag: tag,
          id_producto: s.id_producto,
          sku: s.sku,
          nombre: s.nombre,
          tipo: 'COMPLETO',
          cajas: s.cajas_por_paleta,
          unidades: s.unidades_por_paleta,
          notas: `Paleta completa estándar (${i + 1} de ${s.paletas_completas})`
        }
        s.paletas.push(item)
        allPalletTags.push(item)
      }

      // 2. Pucho si aplica
      if (s.cajas_pucho > 0) {
        const tag = generatedTags[tagIndex++] || `${warehousePrefix}${bultoSeq.toString().padStart(5, '0')}`
        const item: PalletTagItem = {
          bulto_numero: bultoSeq++,
          uid_tag: tag,
          id_producto: s.id_producto,
          sku: s.sku,
          nombre: s.nombre,
          tipo: 'PUCHO',
          cajas: s.cajas_pucho,
          unidades: s.unidades_pucho,
          notas: `Carga pucho / parcial (${s.cajas_pucho} cajas sueltas)`
        }
        s.paletas.push(item)
        allPalletTags.push(item)
      }
    }

    // Tercer paso: etiquetas de contingencia / reserva para muelle
    const contingencyTags: PalletTagItem[] = []
    for (let c = 0; c < contingencyCount; c++) {
      const tag = generatedTags[tagIndex++] || `${warehousePrefix}${(bultoSeq + c).toString().padStart(5, '0')}`
      contingencyTags.push({
        bulto_numero: bultoSeq + c,
        uid_tag: tag,
        sku: 'EXCEDENTE',
        nombre: 'Reserva para bultos o paletas no previstas',
        tipo: 'RESERVA_EXCEDENTE',
        cajas: 0,
        unidades: 0,
        notas: `Etiqueta de contingencia muelle (${c + 1} de ${contingencyCount})`
      })
    }

    const totalUnidades = summaries.reduce((acc, s) => acc + s.cantidad_pedida, 0)
    const totalCajas = summaries.reduce((acc, s) => acc + s.cajas_totales, 0)
    const totalPaletasCompletas = summaries.reduce((acc, s) => acc + s.paletas_completas, 0)
    const totalPuchos = summaries.reduce((acc, s) => acc + (s.cajas_pucho > 0 ? 1 : 0), 0)

    const finalPlan: OrderPackingPlan = {
      numero_orden: order.numero_orden,
      contenedor: order.tipo_contenedor || '40FT',
      proveedor: order.proveedor?.razon_social || order.proveedor?.nombre || 'Proveedor registrado',
      fecha_emision: order.fecha_emision || new Date().toISOString().split('T')[0],
      prefijo_almacen: warehousePrefix,
      total_unidades: totalUnidades,
      total_cajas: totalCajas,
      total_paletas_completas: totalPaletasCompletas,
      total_puchos: totalPuchos,
      total_bultos_previstos: totalBultosCount,
      productos: summaries,
      etiquetas_bultos: allPalletTags,
      etiquetas_reserva: contingencyTags
    }

    // Persistir automáticamente el plan generado en Supabase para congelar y reservar los códigos
    await this.savePackingPlanToOrder(order.numero_orden, finalPlan)

    return finalPlan
  },

  // 4. Exportar a archivo Excel descargable (.xlsx)
  exportPackingListToExcel(plan: OrderPackingPlan): void {
    const wb = XLSX.utils.book_new()

    // ----------------------------------------------------
    // HOJA 1: Resumen de Embarque por Producto
    // ----------------------------------------------------
    const resumenData: any[][] = [
      ['IMPORTACIONES SHALOM · SISTEMA TÁCTICO DE RECEPCIÓN Y WMS'],
      ['PLAN DE RECEPCIÓN Y DESGLOSE DE PALETIZADO'],
      [''],
      ['Número de orden:', plan.numero_orden, '', 'Fecha de emisión:', plan.fecha_emision],
      ['Proveedor:', plan.proveedor, '', 'Tipo de contenedor:', plan.contenedor],
      ['Almacén destino:', `Prefijo ${plan.prefijo_almacen}`, '', 'Total paletas esperadas:', plan.total_bultos_previstos],
      [''],
      [
        'N°',
        'SKU',
        'Descripción del producto',
        'Unid. pedidas',
        'Unid/Caja',
        'Cajas/Paleta',
        'Cajas totales',
        'Paletas completas',
        'Cajas pucho',
        'Total paletas/bultos'
      ]
    ]

    plan.productos.forEach((p, idx) => {
      resumenData.push([
        idx + 1,
        p.sku,
        p.nombre,
        p.cantidad_pedida,
        p.unidades_por_caja,
        p.cajas_por_paleta,
        p.cajas_totales,
        p.paletas_completas,
        p.cajas_pucho,
        p.total_bultos
      ])
    })

    resumenData.push([
      'TOTALES',
      '',
      `${plan.productos.length} productos analizados`,
      plan.total_unidades,
      '',
      '',
      plan.total_cajas,
      plan.total_paletas_completas,
      plan.total_puchos,
      plan.total_bultos_previstos
    ])

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen_Embarque')

    // ----------------------------------------------------
    // HOJA 2: Lista de Paletas y Rótulos / Código de Barras
    // ----------------------------------------------------
    const etiquetasData: any[][] = [
      ['RÓTULOS Y CÓDIGOS DE PALETA PARA ESCANEO EN MUELLE'],
      [`Orden: ${plan.numero_orden} · Contenedor: ${plan.contenedor}`],
      [''],
      [
        'Bulto N°',
        'Código de barra / Tag RFID',
        'Tipo de carga',
        'SKU',
        'Descripción',
        'Cajas en bulto',
        'Unidades en bulto',
        'Verificación muelle',
        'Notas operativas'
      ]
    ]

    plan.etiquetas_bultos.forEach((tag) => {
      etiquetasData.push([
        tag.bulto_numero,
        tag.uid_tag,
        tag.tipo === 'COMPLETO' ? 'Paleta completa' : 'Carga pucho',
        tag.sku,
        tag.nombre,
        tag.cajas,
        tag.unidades,
        '[  ] Conforme',
        tag.notas || ''
      ])
    })

    // Separador para contingencia
    etiquetasData.push([''])
    etiquetasData.push([
      '---',
      'ETIQUETAS DE RESERVA Y CONTINGENCIA (EN CASO DE EXCEDENTES / SOBRANTES EN CONTENEDOR)',
      '---'
    ])
    etiquetasData.push([''])

    plan.etiquetas_reserva.forEach((tag) => {
      etiquetasData.push([
        tag.bulto_numero,
        tag.uid_tag,
        'Reserva contingencia',
        tag.sku,
        tag.nombre,
        '—',
        '—',
        '[  ] Libre / Usada',
        tag.notas || ''
      ])
    })

    const wsEtiquetas = XLSX.utils.aoa_to_sheet(etiquetasData)
    XLSX.utils.book_append_sheet(wb, wsEtiquetas, 'Packing_List_Etiquetas')

    // Descargar el archivo
    const safeNum = plan.numero_orden.replace(/[^A-Za-z0-9_-]/g, '_')
    XLSX.writeFile(wb, `Packing_List_${safeNum}_Paletas_Shalom.xlsx`)
  }
}
