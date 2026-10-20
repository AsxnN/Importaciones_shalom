import { supabase } from '../lib/supabase'
import type { LocationType, PalletRecord, RackCell, WarehouseLane } from '../types/locations'

// Clave para almacenamiento local de contingencia/demo
const STORAGE_PREFIX = 'shalom_wms_racks_'

// Limpieza automática preventiva de paletas zombis heredadas del seed inicial (PROD-X99 / 503)
function purgeLegacyZombiePallets() {
  try {
    const ZOMBIE_TAG = 'E28011606000021A98765433'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(STORAGE_PREFIX + 'pallets_')) {
        const list = JSON.parse(localStorage.getItem(key) || '[]')
        const cleaned = list.filter(
          (p: any) =>
            p.uid_tag !== ZOMBIE_TAG &&
            p.id_etiqueta !== 503 &&
            p.producto?.sku !== 'PROD-X99' &&
            p.codigo_barras !== 'PAL-00103'
        )
        if (cleaned.length !== list.length) {
          localStorage.setItem(key, JSON.stringify(cleaned))
        }
      } else if (key.startsWith(STORAGE_PREFIX + 'cells_')) {
        const cells = JSON.parse(localStorage.getItem(key) || '[]')
        let changed = false
        for (const c of cells) {
          if (
            c.paleta_ocupante &&
            (c.paleta_ocupante.uid_tag === ZOMBIE_TAG ||
              c.paleta_ocupante.id_etiqueta === 503 ||
              c.paleta_ocupante.producto_sku === 'PROD-X99' ||
              c.paleta_ocupante.codigo_barras === 'PAL-00103')
          ) {
            c.paleta_ocupante = null
            changed = true
          }
        }
        if (changed) {
          localStorage.setItem(key, JSON.stringify(cells))
        }
      }
    }
  } catch {}
}

export const locationService = {
  // Obtener carriles de un almacén con sus niveles
  async getWarehouseLanes(warehouseId: number): Promise<WarehouseLane[]> {
    try {
      const { data: lanesData, error: lanesErr } = await supabase
        .from('carril')
        .select(`
          id_carril,
          id_almacen,
          codigo_carril,
          nombre,
          activo,
          nivel_carril (
            id_nivel,
            id_carril,
            numero_nivel,
            nombre_nivel,
            capacidad_paletas
          )
        `)
        .eq('id_almacen', warehouseId)
        .order('codigo_carril')

      if (!lanesErr && lanesData && lanesData.length > 0) {
        return lanesData.map((l: any) => ({
          id_carril: l.id_carril,
          id_almacen: l.id_almacen,
          codigo_carril: l.codigo_carril,
          nombre: l.nombre || `Carril ${l.codigo_carril}`,
          activo: l.activo,
          niveles: (l.nivel_carril || []).sort((a: any, b: any) => a.numero_nivel - b.numero_nivel)
        }))
      }
    } catch {
      // Ignorar y recurrir a fallback
    }

    // Fallback de contingencia local si la tabla aún no se ha ejecutado en Supabase
    return this.getLocalLanes(warehouseId)
  },

  // Obtener todas las celdas (Drive-in y Campo) y las paletas que las ocupan
  async getWarehouseCells(warehouseId: number): Promise<RackCell[]> {
    try {
      const { data: cellsData, error: cellsErr } = await supabase
        .from('celda_rack')
        .select(`
          id_celda,
          id_almacen,
          tipo_ubicacion,
          id_carril,
          id_nivel,
          posicion_fondo,
          codigo_ubicacion,
          descripcion,
          activo,
          etiqueta_rfid (
            id_etiqueta,
            uid_tag,
            codigo_barras,
            id_producto,
            tipo_paleta,
            cantidad_paquetes,
            cantidad_actual,
            estado,
            fecha_enrolamiento,
            producto ( sku, nombre )
          )
        `)
        .eq('id_almacen', warehouseId)
        .order('codigo_ubicacion')

      if (!cellsErr && cellsData && cellsData.length > 0) {
        const localPallets = this.getLocalPallets(warehouseId)
        const mappedCells: RackCell[] = cellsData.map((c: any) => {
          let rawTag: any = null
          if (Array.isArray(c.etiqueta_rfid)) {
            rawTag = c.etiqueta_rfid.find((t: any) => t && t.id_etiqueta && t.estado !== 'VACIA') || null
          } else if (c.etiqueta_rfid && c.etiqueta_rfid.id_etiqueta && c.etiqueta_rfid.estado !== 'VACIA') {
            rawTag = c.etiqueta_rfid
          }

          // Si en Supabase no hay etiqueta en esta celda, verificar si hay alguna asignada en local
          if (!rawTag) {
            const matchedLocal = localPallets.find(
              (p) => p.id_celda && Number(p.id_celda) === Number(c.id_celda) && p.estado !== 'VACIA'
            )
            if (matchedLocal) {
              rawTag = {
                id_etiqueta: matchedLocal.id_etiqueta,
                uid_tag: matchedLocal.uid_tag,
                codigo_barras: matchedLocal.codigo_barras,
                id_producto: matchedLocal.id_producto,
                producto: matchedLocal.producto,
                tipo_paleta: matchedLocal.tipo_paleta,
                cantidad_paquetes: matchedLocal.cantidad_paquetes,
                cantidad_actual: matchedLocal.cantidad_actual,
                fecha_enrolamiento: new Date().toISOString()
              }
            }
          }

          const hasOccupant = Boolean(rawTag && rawTag.id_etiqueta)

          return {
            id_celda: c.id_celda,
            id_almacen: c.id_almacen,
            tipo_ubicacion: (c.tipo_ubicacion as LocationType) || 'RACK',
            id_carril: c.id_carril,
            id_nivel: c.id_nivel,
            posicion_fondo: c.posicion_fondo,
            codigo_ubicacion: c.codigo_ubicacion,
            descripcion: c.descripcion,
            activo: c.activo,
            paleta_ocupante: hasOccupant ? {
              id_etiqueta: rawTag.id_etiqueta,
              uid_tag: rawTag.uid_tag,
              codigo_barras: rawTag.codigo_barras,
              id_producto: rawTag.id_producto,
              producto_sku: rawTag.producto?.sku || 'SKU',
              producto_nombre: rawTag.producto?.nombre || 'Producto',
              tipo_paleta: rawTag.tipo_paleta,
              cantidad_paquetes: rawTag.cantidad_paquetes,
              cantidad_actual: rawTag.cantidad_actual,
              fecha_enrolamiento: rawTag.fecha_enrolamiento || new Date().toISOString()
            } : null
          }
        })

        // Asegurar que la celda ZONA CAMPO siempre esté presente en la lista
        const hasCampo = mappedCells.some((c) => c.tipo_ubicacion === 'CAMPO' || c.codigo_ubicacion?.includes('CAMPO'))
        if (!hasCampo) {
          mappedCells.push({
            id_celda: 9999 + warehouseId,
            id_almacen: warehouseId,
            tipo_ubicacion: 'CAMPO',
            id_carril: null,
            id_nivel: null,
            posicion_fondo: null,
            codigo_ubicacion: `ALM${warehouseId}-CAMPO`,
            descripcion: 'Zona de Piso / Estiba Libre para Productos Sobredimensionados',
            activo: true,
            paleta_ocupante: null
          })
        }

        return mappedCells
      }
    } catch {
      // Ignorar y recurrir a fallback
    }

    return this.getLocalCells(warehouseId)
  },

  // Obtener paletas del almacén
  // Obtener paletas del almacén
  async getWarehousePallets(warehouseId: number): Promise<PalletRecord[]> {
    try {
      const { data: palletsData, error: pErr } = await supabase
        .from('etiqueta_rfid')
        .select(`
          id_etiqueta,
          uid_tag,
          codigo_barras,
          id_producto,
          id_almacen_actual,
          id_celda,
          tipo_paleta,
          cantidad_paquetes,
          cantidad_actual,
          estado,
          notas,
          producto ( sku, nombre ),
          celda_rack ( codigo_ubicacion, tipo_ubicacion )
        `)
        .eq('id_almacen_actual', warehouseId)
        .eq('estado', 'ACTIVA')

      if (!pErr && palletsData) {
        const remoteList: PalletRecord[] = palletsData.map((p: any) => {
          const isCampo = p.celda_rack?.tipo_ubicacion === 'CAMPO' ||
            p.celda_rack?.codigo_ubicacion?.includes('CAMPO') ||
            Number(p.id_celda) === 9999 + warehouseId ||
            p.notas === 'ZONA_CAMPO' ||
            p.notas?.toUpperCase().includes('CAMPO')
          return {
            id_etiqueta: p.id_etiqueta,
            uid_tag: p.uid_tag,
            codigo_barras: p.codigo_barras,
            id_producto: p.id_producto,
            id_almacen_actual: p.id_almacen_actual,
            id_celda: p.id_celda || (isCampo ? 9999 + warehouseId : null),
            codigo_ubicacion: p.celda_rack?.codigo_ubicacion || (isCampo ? `ALM${warehouseId}-CAMPO` : null),
            tipo_ubicacion: (isCampo ? 'CAMPO' : p.celda_rack?.tipo_ubicacion) as LocationType | undefined,
            tipo_paleta: p.tipo_paleta,
            cantidad_paquetes: p.cantidad_paquetes,
            cantidad_actual: p.cantidad_actual,
            estado: p.estado,
            notas: p.notas,
            producto: p.producto
          }
        })

        const localList = this.getLocalPallets(warehouseId)
        if (remoteList.length === 0 && localList.length > 0) {
          return localList
        }

        // Fusionar paletas remotas con paletas locales:
        // Si una paleta local tiene ubicación activa en Zona Campo o en celda, preservarla
        const remoteUids = new Set(remoteList.map((p) => p.uid_tag))
        const combined: PalletRecord[] = remoteList.map((rp: PalletRecord) => {
          const lp = localList.find(
            (item) => item.uid_tag === rp.uid_tag || String(item.id_etiqueta) === String(rp.id_etiqueta)
          )
          if (lp) {
            // Si localmente está en Zona Campo, asegurar que mantenga su asignación
            if (lp.tipo_ubicacion === 'CAMPO' || lp.codigo_ubicacion?.includes('CAMPO') || Number(lp.id_celda) >= 9999) {
              return {
                ...rp,
                id_celda: lp.id_celda || 9999 + warehouseId,
                codigo_ubicacion: lp.codigo_ubicacion || `ALM${warehouseId}-CAMPO`,
                tipo_ubicacion: 'CAMPO'
              }
            }
            // Si localmente tiene celda asignada y en remoto está null
            if (lp.id_celda && !rp.id_celda) {
              return {
                ...rp,
                id_celda: lp.id_celda,
                codigo_ubicacion: lp.codigo_ubicacion,
                tipo_ubicacion: lp.tipo_ubicacion
              }
            }
          }
          return rp
        })

        for (const lp of localList) {
          if (!remoteUids.has(lp.uid_tag) && lp.estado === 'ACTIVA') {
            combined.push(lp)
          }
        }

        localStorage.setItem(`${STORAGE_PREFIX}pallets_${warehouseId}`, JSON.stringify(combined))
        return combined
      }
    } catch {
      // Fallback
    }

    return this.getLocalPallets(warehouseId)
  },

  // Configurar o Actualizar Carril Drive-In
  async configureLane(
    warehouseId: number,
    codigoCarril: string,
    nombre: string,
    niveles: { numero_nivel: number; capacidad_paletas: number }[]
  ): Promise<boolean> {
    const cleanCode = codigoCarril.trim().toUpperCase()

    try {
      const { data, error } = await supabase.rpc('configurar_carril_drivein', {
        p_id_almacen: warehouseId,
        p_codigo_carril: cleanCode,
        p_nombre: nombre || `Carril ${cleanCode}`,
        p_niveles: niveles
      })

      if (!error && data) {
        return true
      }
    } catch {
      // Usar fallback local
    }

    // Configuración local
    return this.saveLocalLane(warehouseId, cleanCode, nombre, niveles)
  },

  // Asignar Paleta a Celda (o a Zona de Campo)
  async assignPalletToCell(palletId: number, cellId: number, warehouseId: number): Promise<boolean> {
    const isCampo = Number(cellId) >= 9999
    try {
      if (isCampo) {
        // En Zona Campo, buscar si existe celda de CAMPO en celda_rack para evitar violar FK
        const { data: cData } = await supabase
          .from('celda_rack')
          .select('id_celda')
          .eq('id_almacen', warehouseId)
          .eq('tipo_ubicacion', 'CAMPO')
          .maybeSingle()

        if (cData?.id_celda) {
          await supabase
            .from('etiqueta_rfid')
            .update({ id_celda: cData.id_celda, id_almacen_actual: warehouseId, notas: 'ZONA_CAMPO' })
            .eq('id_etiqueta', palletId)
        } else {
          // Si no existe fila física en celda_rack, marcar notas 'ZONA_CAMPO' y id_celda = null
          await supabase
            .from('etiqueta_rfid')
            .update({ id_celda: null, id_almacen_actual: warehouseId, notas: 'ZONA_CAMPO' })
            .eq('id_etiqueta', palletId)
        }
      } else {
        await supabase
          .from('etiqueta_rfid')
          .update({ id_celda: cellId, id_almacen_actual: warehouseId })
          .eq('id_etiqueta', palletId)
      }
    } catch (err) {
      console.warn('[assignPalletToCell] Error en Supabase:', err)
    }

    // SIEMPRE guardar en localStorage para mantener la UI sincronizada
    return this.saveLocalPalletCellAssignment(palletId, cellId, warehouseId)
  },

  // Desasignar Paleta de su ubicación actual (por palletId o por cellId)
  async unassignPallet(palletId?: number | null, cellId?: number | null, warehouseId?: number): Promise<boolean> {
    try {
      if (palletId) {
        await supabase
          .from('etiqueta_rfid')
          .update({ id_celda: null, notas: null })
          .eq('id_etiqueta', palletId)
      }
      if (cellId && Number(cellId) < 9999) {
        await supabase
          .from('etiqueta_rfid')
          .update({ id_celda: null, notas: null })
          .eq('id_celda', cellId)
      }
    } catch (err) {
      console.warn('[unassignPallet] Error en Supabase:', err)
    }

    // SIEMPRE sincronizar y limpiar en localStorage
    this.saveLocalPalletUnassign(palletId, cellId, warehouseId)
    return true
  },

  // Desasignar / liberar todas las paletas de un carril completo
  async unassignLane(laneId: number, warehouseId: number): Promise<{ count: number }> {
    let releasedCount = 0

    try {
      // 1. Obtener los IDs de todas las celdas pertenecientes a este carril
      const { data: cellsData, error: cellsErr } = await supabase
        .from('celda_rack')
        .select('id_celda')
        .eq('id_carril', laneId)

      if (!cellsErr && cellsData && cellsData.length > 0) {
        const cellIds = cellsData.map((c) => c.id_celda)
        const { data: updated, error: updErr } = await supabase
          .from('etiqueta_rfid')
          .update({ id_celda: null })
          .in('id_celda', cellIds)
          .select('id_etiqueta')

        if (!updErr && updated) {
          releasedCount = updated.length
        }
      }
    } catch (err) {
      console.warn('[unassignLane] Error en Supabase, ejecutando limpieza local:', err)
    }

    // 2. Limpieza de respaldo local
    const localCount = this.saveLocalLaneUnassign(laneId, warehouseId)
    return { count: Math.max(releasedCount, localCount) }
  },

  // Dar de baja paleta utilizando la RPC oficial dar_baja_etiqueta_rfid (pasa a estado VACIA sin DELETE)
  async decommissionOrDeletePallet(
    palletId: number,
    warehouseId: number,
    motivo: string = 'Baja de etiqueta',
    uidTag?: string,
    idProducto?: number,
    cantidadDescontar?: number
  ): Promise<boolean> {
    const cleanTag = uidTag?.trim().toUpperCase()

    // 1. Invocar la RPC oficial dar_baja_etiqueta_rfid (Script 2 de mejoras_recomendadas.md)
    if (cleanTag) {
      try {
        const { data, error: rpcErr } = await supabase.rpc('dar_baja_etiqueta_rfid', {
          p_uid_tag: cleanTag,
          p_motivo: motivo || 'Baja de etiqueta'
        })
        if (!rpcErr && data && data.ok) {
          this.saveLocalPalletDecommission(palletId, warehouseId, cleanTag)
          return true
        }
      } catch {
        // Continuar al fallback de actualización directa
      }
    }

    // 2. Fallback directo: actualizar a estado VACIA (CERO DELETE, preservando integridad de historial)
    try {
      let unitsToDiscount = cantidadDescontar || 0
      let prodId = idProducto

      if (!prodId || unitsToDiscount <= 0) {
        const { data: pInfo } = await supabase
          .from('etiqueta_rfid')
          .select('id_producto, cantidad_actual, cantidad_paquetes')
          .eq('id_etiqueta', palletId)
          .maybeSingle()
        if (pInfo) {
          prodId = prodId || pInfo.id_producto
          unitsToDiscount = unitsToDiscount || Number(pInfo.cantidad_actual) || Number(pInfo.cantidad_paquetes) || 0
        }
      }

      // Descontar inventario contable
      if (prodId && unitsToDiscount > 0) {
        const { data: invRow } = await supabase
          .from('inventario')
          .select('stock_real, stock_minimo, consumo_abs')
          .eq('id_producto', prodId)
          .eq('id_almacen', warehouseId)
          .maybeSingle()

        if (invRow) {
          const nuevoStock = Math.max(0, Number(invRow.stock_real) - unitsToDiscount)
          const nuevoConsumo = (Number(invRow.consumo_abs) || 0) + unitsToDiscount
          const semaforo = nuevoStock <= 0 ? 'ROJO' : nuevoStock <= (invRow.stock_minimo || 0) ? 'AMARILLO' : 'VERDE'

          await supabase
            .from('inventario')
            .update({
              stock_real: nuevoStock,
              consumo_abs: nuevoConsumo,
              estado_semaforo: semaforo
            })
            .eq('id_producto', prodId)
            .eq('id_almacen', warehouseId)
        }

        // Registrar en Kardex movimiento RETIRO_PARCIAL (cantidad positiva)
        try {
          await supabase.from('movimiento').insert({
            id_etiqueta: palletId,
            id_producto: prodId,
            tipo: 'RETIRO_PARCIAL',
            cantidad_afectada: unitsToDiscount,
            destino_almacen: null,
            motivo: `Baja de etiqueta ${cleanTag || `#${palletId}`}. ${motivo}`
          })
        } catch {}
      }

      // Actualizar etiqueta a estado VACIA (nunca DELETE)
      const { error: updErr } = await supabase
        .from('etiqueta_rfid')
        .update({
          estado: 'VACIA',
          cantidad_paquetes: 0,
          cantidad_actual: 0,
          id_almacen_actual: null,
          id_celda: null,
          notas: `Baja: ${motivo}`
        })
        .eq('id_etiqueta', palletId)

      if (!updErr) {
        this.saveLocalPalletDecommission(palletId, warehouseId, cleanTag)
        return true
      }
    } catch {
      // Fallback local
    }

    return this.saveLocalPalletDecommission(palletId, warehouseId, cleanTag)
  },

  // Sincronizar y cuadrar el stock contable de un almacén con sus paletas físicas reales
  async syncWarehouseStockWithPallets(
    warehouseId: number,
    inventoryItems: { id_producto: number; stock_real: number; stock_minimo: number }[]
  ): Promise<{ success: boolean; mensaje: string; adjustedCount: number }> {
    // 1. Intentar el procedimiento almacenado
    try {
      const { data, error } = await supabase.rpc('sincronizar_stock_con_paletas_almacen', {
        p_id_almacen: warehouseId
      })
      if (!error && data && (data as any).success) {
        return {
          success: true,
          mensaje: (data as any).mensaje || 'Stock cuadrado exitosamente con las paletas físicas.',
          adjustedCount: (data as any).productos_ajustados || 0
        }
      }
    } catch {}

    // 2. Fallback directo en cliente: obtener las paletas físicas reales de este almacén
    let adjustedCount = 0
    try {
      const pallets = await this.getWarehousePallets(warehouseId)

      for (const item of inventoryItems) {
        const prodPallets = pallets.filter((p) => p.id_producto === item.id_producto)
        const physicalUnits = prodPallets.reduce(
          (acc, p) => acc + (Number(p.cantidad_actual) || Number(p.cantidad_paquetes) || 0),
          0
        )

        if (Number(item.stock_real) !== physicalUnits) {
          const semaforo = physicalUnits <= 0 ? 'ROJO' : physicalUnits <= item.stock_minimo ? 'AMARILLO' : 'VERDE'

          // Actualizar inventario
          await supabase
            .from('inventario')
            .update({
              stock_real: physicalUnits,
              estado_semaforo: semaforo
            })
            .eq('id_almacen', warehouseId)
            .eq('id_producto', item.id_producto)

          // Registrar movimiento en Kardex
          try {
            await supabase.from('movimiento').insert({
              id_producto: item.id_producto,
              tipo: 'AJUSTE',
              cantidad_afectada: Math.abs(Number(item.stock_real) - physicalUnits),
              destino_almacen: warehouseId,
              motivo: `Cuadre con paletas físicas: de ${item.stock_real} a ${physicalUnits} unidades`
            })
          } catch {}

          adjustedCount++
        }
      }

      return {
        success: true,
        mensaje: `Stock cuadrado exitosamente. Se actualizaron ${adjustedCount} productos según las paletas físicas reales.`,
        adjustedCount
      }
    } catch (err: any) {
      return {
        success: false,
        mensaje: `Error al sincronizar stock: ${err.message}`,
        adjustedCount
      }
    }
  },

  // Poner stock de un producto en 0 porque ya no quedan paletas ni bultos en bodega
  async zeroOutProductStock(
    warehouseId: number,
    productId: number,
    motivo: string = 'Baja total: paletas físicas retiradas del almacén'
  ): Promise<boolean> {
    try {
      const { error: rpcErr } = await supabase.rpc('ajustar_inventario_paletas', {
        p_id_producto: productId,
        p_id_almacen: warehouseId,
        p_paletas: 0,
        p_puchos: 0,
        p_motivo: motivo
      })
      if (!rpcErr) return true
    } catch {}

    // Fallback directo
    try {
      const { data: currentInv } = await supabase
        .from('inventario')
        .select('stock_real')
        .eq('id_almacen', warehouseId)
        .eq('id_producto', productId)
        .maybeSingle()

      const prevStock = currentInv ? Number(currentInv.stock_real) : 0

      const { error } = await supabase
        .from('inventario')
        .update({
          stock_real: 0,
          estado_semaforo: 'ROJO'
        })
        .eq('id_almacen', warehouseId)
        .eq('id_producto', productId)

      if (prevStock > 0) {
        try {
          await supabase.from('movimiento').insert({
            id_producto: productId,
            tipo: 'RETIRO_PARCIAL',
            cantidad_afectada: prevStock,
            destino_almacen: warehouseId,
            motivo
          })
        } catch {}
      }

      return !error
    } catch {
      return false
    }
  },

  // Enrolar/Crear o reactivar paleta respetando reglas de unicidad, un solo pucho por SKU y Kardex
  async createPallet(data: {
    id_producto: number
    id_almacen: number
    uid_tag: string
    codigo_barras?: string
    tipo_paleta: 'COMPLETO' | 'PUCHO'
    cantidad_paquetes: number
    id_celda?: number | null
    sku?: string
    nombre?: string
    unidades_totales?: number
  }): Promise<PalletRecord> {
    const cleanTag = data.uid_tag.trim().toUpperCase()
    const units = data.unidades_totales && data.unidades_totales > 0
      ? data.unidades_totales
      : data.cantidad_paquetes

    // 1. Validar si la etiqueta ya existe y su estado
    try {
      const { data: existingTag } = await supabase
        .from('etiqueta_rfid')
        .select('id_etiqueta, estado, id_almacen_actual')
        .eq('uid_tag', cleanTag)
        .maybeSingle()

      if (existingTag && existingTag.estado === 'ACTIVA') {
        throw new Error(
          `La etiqueta RFID [${cleanTag}] ya está ACTIVA en el sistema (almacén #${existingTag.id_almacen_actual}). No se puede registrar dos veces un tag activo.`
        )
      }

      // 2. Regla de un solo pucho activo por producto y almacén (Script 1)
      if (data.tipo_paleta === 'PUCHO') {
        const { data: existingPucho } = await supabase
          .from('etiqueta_rfid')
          .select('id_etiqueta, uid_tag, cantidad_paquetes')
          .eq('id_producto', data.id_producto)
          .eq('id_almacen_actual', data.id_almacen)
          .eq('tipo_paleta', 'PUCHO')
          .eq('estado', 'ACTIVA')
          .maybeSingle()

        if (existingPucho && existingPucho.uid_tag !== cleanTag) {
          throw new Error(
            `Ya existe un pucho activo para este producto en esta sede (Tag: ${existingPucho.uid_tag}, ${existingPucho.cantidad_paquetes} cajas). Solo se permite un pucho activo por SKU en cada almacén.`
          )
        }
      }

      // 3. Si la etiqueta ya existía (en estado VACIA o EXTRAVIADA), se reactiva mediante UPDATE (Regla 3)
      let created: any
      const isCampo = Number(data.id_celda) >= 9999
      const remoteCellId = isCampo ? null : (data.id_celda || null)
      const notasValue = isCampo ? 'ZONA_CAMPO' : null

      if (existingTag) {
        const { data: updated, error: updErr } = await supabase
          .from('etiqueta_rfid')
          .update({
            id_producto: data.id_producto,
            id_almacen_actual: data.id_almacen,
            codigo_barras: data.codigo_barras ? data.codigo_barras.trim().toUpperCase() : null,
            tipo_paleta: data.tipo_paleta,
            cantidad_paquetes: data.cantidad_paquetes,
            cantidad_actual: units,
            id_celda: remoteCellId,
            estado: 'ACTIVA',
            notas: notasValue || `Reactivada en almacén #${data.id_almacen}`
          })
          .eq('id_etiqueta', existingTag.id_etiqueta)
          .select('*, producto(sku, nombre)')
          .single()

        if (updErr) throw updErr
        created = updated
      } else {
        // Nueva etiqueta
        const { data: inserted, error: insErr } = await supabase
          .from('etiqueta_rfid')
          .insert({
            id_producto: data.id_producto,
            id_almacen_actual: data.id_almacen,
            uid_tag: cleanTag,
            codigo_barras: data.codigo_barras ? data.codigo_barras.trim().toUpperCase() : null,
            tipo_paleta: data.tipo_paleta,
            cantidad_paquetes: data.cantidad_paquetes,
            cantidad_actual: units,
            id_celda: remoteCellId,
            estado: 'ACTIVA',
            notas: notasValue
          })
          .select('*, producto(sku, nombre)')
          .single()

        if (insErr) throw insErr
        created = inserted
      }

      if (created) {
        // 4. Sumar unidades físicas automáticamente a la tabla inventario
        try {
          const { data: invRow } = await supabase
            .from('inventario')
            .select('stock_real, stock_minimo')
            .eq('id_almacen', data.id_almacen)
            .eq('id_producto', data.id_producto)
            .maybeSingle()

          const currStock = invRow ? Number(invRow.stock_real) : 0
          const newStock = currStock + units
          const minStock = invRow?.stock_minimo ?? 100
          const semaforo = newStock <= 0 ? 'ROJO' : newStock <= minStock ? 'AMARILLO' : 'VERDE'

          const { error: invErr } = await supabase
            .from('inventario')
            .upsert(
              {
                id_almacen: data.id_almacen,
                id_producto: data.id_producto,
                stock_real: newStock,
                stock_minimo: minStock,
                estado_semaforo: semaforo
              },
              { onConflict: 'id_producto,id_almacen' }
            )

          if (invErr) {
            console.warn('[createPallet] Error en upsert de inventario:', invErr.message)
          }

          // 5. Registrar movimiento en Kardex con tipo válido del enum movimiento_tipo
          const movTipo = data.tipo_paleta === 'COMPLETO' ? 'INGRESO_COMPLETO' : 'INGRESO_PUCHO'
          if (units > 0) {
            const { error: movErr } = await supabase.from('movimiento').insert({
              id_etiqueta: created.id_etiqueta,
              id_producto: data.id_producto,
              tipo: movTipo,
              cantidad_afectada: units,
              destino_almacen: data.id_almacen,
              motivo: `Ingreso paleta RFID [${cleanTag}] (${data.tipo_paleta}: ${data.cantidad_paquetes} cajas, ${units} unidades)`
            })
            if (movErr) {
              console.warn('[createPallet] Error registrando movimiento Kardex:', movErr.message)
            }
          }
        } catch (invCatchErr: any) {
          console.warn('[createPallet] Error actualizando stock/kardex:', invCatchErr?.message)
        }

        this.createLocalPallet({ ...data, uid_tag: cleanTag, cantidad_paquetes: data.cantidad_paquetes })
        return {
          id_etiqueta: created.id_etiqueta,
          uid_tag: created.uid_tag,
          codigo_barras: created.codigo_barras,
          id_producto: created.id_producto,
          id_almacen_actual: created.id_almacen_actual,
          id_celda: created.id_celda,
          tipo_paleta: created.tipo_paleta,
          cantidad_paquetes: created.cantidad_paquetes,
          cantidad_actual: created.cantidad_actual,
          estado: created.estado,
          producto: created.producto
        }
      }
      return this.createLocalPallet({ ...data, uid_tag: cleanTag, cantidad_paquetes: data.cantidad_paquetes })
    } catch (err: any) {
      console.warn('[createPallet] Error en Supabase, evaluando fallback:', err)
      // Si es una regla de negocio explícita (tag duplicado activo o regla de pucho único), propagar la advertencia
      if (err?.message && (err.message.includes('ya está ACTIVA') || err.message.includes('Solo se permite un pucho activo'))) {
        throw err
      }
      // Ante errores de RLS (42501), desconexión o tablas no migradas, usar fallback local seguro
      return this.createLocalPallet({ ...data, uid_tag: cleanTag, cantidad_paquetes: data.cantidad_paquetes })
    }
  },

  // Sincronizar cache local de paletas tras una transferencia
  syncLocalPalletTransfer(
    uidOrigen: string,
    uidDestino: string,
    idAlmacenOrigen: number,
    idAlmacenDestino: number,
    palletData?: any
  ): void {
    const cleanOrig = uidOrigen.trim().toUpperCase()
    const cleanDest = uidDestino.trim().toUpperCase()

    // 1. Quitar la paleta de origen
    const origKey = `${STORAGE_PREFIX}pallets_${idAlmacenOrigen}`
    let transferredItem: PalletRecord | null = null
    try {
      const origList: PalletRecord[] = JSON.parse(localStorage.getItem(origKey) || '[]')
      transferredItem = origList.find((p) => p.uid_tag?.trim().toUpperCase() === cleanOrig) || null
      const filtered = origList.filter((p) => p.uid_tag?.trim().toUpperCase() !== cleanOrig)
      localStorage.setItem(origKey, JSON.stringify(filtered))
    } catch {}

    // Desocupar celda en origen
    const origCellKey = `${STORAGE_PREFIX}cells_${idAlmacenOrigen}`
    try {
      const cells: RackCell[] = JSON.parse(localStorage.getItem(origCellKey) || '[]')
      let cChanged = false
      for (const cell of cells) {
        if (cell.paleta_ocupante && cell.paleta_ocupante.uid_tag?.trim().toUpperCase() === cleanOrig) {
          cell.paleta_ocupante = null
          cChanged = true
        }
      }
      if (cChanged) localStorage.setItem(origCellKey, JSON.stringify(cells))
    } catch {}

    // 2. Agregar paleta al destino
    const destKey = `${STORAGE_PREFIX}pallets_${idAlmacenDestino}`
    try {
      const destList: PalletRecord[] = JSON.parse(localStorage.getItem(destKey) || '[]')
      const newPallet: PalletRecord = {
        id_etiqueta: Date.now(),
        uid_tag: cleanDest,
        id_producto: palletData?.id_producto || transferredItem?.id_producto || 1,
        id_almacen_actual: idAlmacenDestino,
        id_celda: null,
        codigo_ubicacion: undefined,
        tipo_ubicacion: 'CAMPO',
        tipo_paleta: palletData?.tipo_paleta || transferredItem?.tipo_paleta || 'COMPLETO',
        cantidad_paquetes: palletData?.cantidad_paquetes || transferredItem?.cantidad_paquetes || 1,
        cantidad_actual: palletData?.cantidad_actual || transferredItem?.cantidad_actual || 1,
        estado: 'ACTIVA',
        notas: `Transferida desde ${cleanOrig}`,
        producto: palletData?.producto || transferredItem?.producto
      }

      const updatedDest = destList.filter((p) => p.uid_tag?.trim().toUpperCase() !== cleanDest)
      updatedDest.push(newPallet)
      localStorage.setItem(destKey, JSON.stringify(updatedDest))
    } catch {}
  },

  // Transferir carga entre almacenes utilizando la RPC oficial o fallback inteligente ante colisión de tags
  async transferPallet(
    uidOrigen: string,
    idAlmacenOrigen: number,
    idAlmacenDestino: number,
    motivo: string = 'Transferencia entre almacenes'
  ): Promise<{
    ok: boolean
    uid_origen: string
    uid_destino: string
    uid_pucho_restante?: string | null
    uid_pucho_cerrado?: string | null
    alerta_generada: boolean
    unidades_transferidas: number
    mensaje: string
  }> {
    const cleanUidOrigen = uidOrigen.trim().toUpperCase()

    // 1. Intentar primero ejecutar la RPC oficial en base de datos
    try {
      const { data, error } = await supabase.rpc('transferir_carga_entre_almacenes', {
        p_uid_origen: cleanUidOrigen,
        p_id_almacen_origen: idAlmacenOrigen,
        p_id_almacen_destino: idAlmacenDestino,
        p_motivo: motivo
      })

      if (!error && data && data.ok) {
        this.syncLocalPalletTransfer(cleanUidOrigen, data.uid_destino, idAlmacenOrigen, idAlmacenDestino)
        return data
      }

      const isCollisionOrConstraint =
        error &&
        (error.code === '23505' ||
          error.message?.toLowerCase().includes('duplicate key') ||
          error.message?.toLowerCase().includes('unique constraint') ||
          error.message?.includes('etiqueta_rfid_uid_tag_key') ||
          error.details?.toLowerCase().includes('already exists'))

      if (error && !isCollisionOrConstraint) {
        throw error
      }
    } catch (err: any) {
      const isCollisionOrConstraint =
        err?.code === '23505' ||
        err?.message?.toLowerCase().includes('duplicate key') ||
        err?.message?.toLowerCase().includes('unique constraint') ||
        err?.message?.includes('etiqueta_rfid_uid_tag_key') ||
        err?.details?.toLowerCase().includes('already exists')

      if (!isCollisionOrConstraint) {
        throw err
      }
      console.warn(
        '[locationService.transferPallet] RPC transferir_carga colisionó con constraint único de tag. Ejecutando transferencia inteligente con resolución de unicidad...',
        err?.message
      )
    }

    // 2. Fallback Inteligente y Resiliente (Resolución de Colisión de Tags 1:1)
    // A. Obtener datos de la etiqueta de origen
    let origTag: any = null
    try {
      const { data: dbOrig } = await supabase
        .from('etiqueta_rfid')
        .select('*, producto(id_producto, sku, nombre, regla_empaque(unidades_por_caja, cajas_por_camada, numero_camadas, cajas_por_camita, camitas_por_paleta))')
        .eq('uid_tag', cleanUidOrigen)
        .maybeSingle()
      if (dbOrig) origTag = dbOrig
    } catch {}

    if (!origTag) {
      const localPallets = this.getLocalPallets(idAlmacenOrigen)
      const found = localPallets.find((p) => p.uid_tag?.trim().toUpperCase() === cleanUidOrigen)
      if (found) {
        origTag = {
          id_etiqueta: found.id_etiqueta,
          uid_tag: found.uid_tag,
          id_producto: found.id_producto,
          tipo_paleta: found.tipo_paleta,
          cantidad_paquetes: found.cantidad_paquetes,
          cantidad_actual: found.cantidad_actual,
          producto: found.producto
        }
      }
    }

    if (!origTag) {
      throw new Error(`La paleta [${cleanUidOrigen}] no se encontró activa en el almacén de origen.`)
    }

    // B. Obtener almacén de destino y su prefijo oficial
    const { data: whDest } = await supabase
      .from('almacen')
      .select('id_almacen, nombre, prefijo_rfid')
      .eq('id_almacen', idAlmacenDestino)
      .maybeSingle()

    const prefix = whDest?.prefijo_rfid || (whDest?.nombre ? whDest.nombre.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() : `ALM${idAlmacenDestino}`)
    const destName = whDest?.nombre || 'Almacén de destino'

    // C. Determinar unidades y cajas a transferir
    const prod = origTag.producto
    const r = Array.isArray(prod?.regla_empaque) ? prod?.regla_empaque[0] : prod?.regla_empaque
    const uCaja = Math.max(1, r?.unidades_por_caja || 1)
    const transferUnits = Number(origTag.cantidad_actual) || (Number(origTag.cantidad_paquetes || 1) * uCaja)
    const transferBoxes = Number(origTag.cantidad_paquetes) || Math.max(1, Math.floor(transferUnits / uCaja))

    // D. Calcular el menor código RFID libre en destino (rellenando huecos de menor a mayor)
    const occupiedNumbers = new Set<number>()
    const vaciaTagByUid = new Map<string, any>()

    try {
      const { data: existingTags } = await supabase
        .from('etiqueta_rfid')
        .select('id_etiqueta, uid_tag, estado')
        .ilike('uid_tag', `${prefix}%`)

      if (existingTags && existingTags.length > 0) {
        for (const t of existingTags) {
          const numStr = t.uid_tag.slice(prefix.length).replace(/\D/g, '')
          if (numStr) {
            const num = parseInt(numStr, 10)
            if (t.estado === 'ACTIVA') {
              occupiedNumbers.add(num)
            } else {
              vaciaTagByUid.set(t.uid_tag.trim().toUpperCase(), t)
            }
          }
        }
      }
    } catch {}

    // Buscar de menor a mayor el primer hueco libre (1, 2, 3...)
    let nextNum = 1
    while (occupiedNumbers.has(nextNum)) {
      nextNum++
    }
    const generatedUidDestino = `${prefix}${nextNum.toString().padStart(5, '0')}`
    const vaciaTagToReactivate = vaciaTagByUid.get(generatedUidDestino) || null

    let finalUidDestino = generatedUidDestino
    let destEtiquetaId: number | null = null

    // E. Si el tipo de paleta es PUCHO, verificar si ya existe un pucho activo en el destino
    let alertaGenerada = false
    let uidPuchoCerrado: string | null = null

    if (origTag.tipo_paleta === 'PUCHO') {
      let destPucho: any = null
      try {
        const { data: puchoData } = await supabase
          .from('etiqueta_rfid')
          .select('*')
          .eq('id_producto', origTag.id_producto)
          .eq('id_almacen_actual', idAlmacenDestino)
          .eq('tipo_paleta', 'PUCHO')
          .eq('estado', 'ACTIVA')
          .maybeSingle()
        destPucho = puchoData
      } catch {}

      if (destPucho) {
        const cCamada = Math.max(1, r?.cajas_por_camada || r?.cajas_por_camita || 1)
        const nCamadas = Math.max(1, r?.numero_camadas || r?.camitas_por_paleta || 1)
        const cPaleta = cCamada * nCamadas
        const totalCajas = Number(destPucho.cantidad_paquetes || 0) + transferBoxes

        if (totalCajas < cPaleta) {
          await supabase
            .from('etiqueta_rfid')
            .update({
              cantidad_paquetes: totalCajas,
              cantidad_actual: totalCajas * uCaja,
              notas: `Pucho consolidado (+${transferBoxes} cajas de ${cleanUidOrigen})`
            })
            .eq('id_etiqueta', destPucho.id_etiqueta)

          finalUidDestino = destPucho.uid_tag
          destEtiquetaId = destPucho.id_etiqueta
        } else {
          uidPuchoCerrado = destPucho.uid_tag
          await supabase
            .from('etiqueta_rfid')
            .update({
              estado: 'VACIA',
              cantidad_paquetes: 0,
              cantidad_actual: 0,
              id_almacen_actual: null,
              id_celda: null,
              notas: `Consolidado en paleta completa ${generatedUidDestino}`
            })
            .eq('id_etiqueta', destPucho.id_etiqueta)

          if (vaciaTagToReactivate) {
            await supabase
              .from('etiqueta_rfid')
              .update({
                id_producto: origTag.id_producto,
                tipo_paleta: 'COMPLETO',
                cantidad_paquetes: cPaleta,
                cantidad_actual: cPaleta * uCaja,
                estado: 'ACTIVA',
                id_almacen_actual: idAlmacenDestino,
                id_celda: null,
                notas: 'Paleta completa formada por consolidación de puchos (hueco rellenado)'
              })
              .eq('id_etiqueta', vaciaTagToReactivate.id_etiqueta)

            finalUidDestino = generatedUidDestino
            destEtiquetaId = vaciaTagToReactivate.id_etiqueta
          } else {
            const { data: insComp } = await supabase
              .from('etiqueta_rfid')
              .insert({
                uid_tag: generatedUidDestino,
                id_producto: origTag.id_producto,
                tipo_paleta: 'COMPLETO',
                cantidad_paquetes: cPaleta,
                cantidad_actual: cPaleta * uCaja,
                estado: 'ACTIVA',
                id_almacen_actual: idAlmacenDestino,
                notas: 'Paleta completa formada por consolidación de puchos'
              })
              .select('id_etiqueta')
              .single()

            finalUidDestino = generatedUidDestino
            destEtiquetaId = insComp?.id_etiqueta || null
          }
          alertaGenerada = true
        }
      } else {
        if (vaciaTagToReactivate) {
          await supabase
            .from('etiqueta_rfid')
            .update({
              id_producto: origTag.id_producto,
              tipo_paleta: 'PUCHO',
              cantidad_paquetes: transferBoxes,
              cantidad_actual: transferUnits,
              estado: 'ACTIVA',
              id_almacen_actual: idAlmacenDestino,
              id_celda: null,
              notas: `Pucho transferido desde ${cleanUidOrigen} (hueco rellenado)`
            })
            .eq('id_etiqueta', vaciaTagToReactivate.id_etiqueta)

          finalUidDestino = generatedUidDestino
          destEtiquetaId = vaciaTagToReactivate.id_etiqueta
        } else {
          const { data: insPucho } = await supabase
            .from('etiqueta_rfid')
            .insert({
              uid_tag: generatedUidDestino,
              id_producto: origTag.id_producto,
              tipo_paleta: 'PUCHO',
              cantidad_paquetes: transferBoxes,
              cantidad_actual: transferUnits,
              estado: 'ACTIVA',
              id_almacen_actual: idAlmacenDestino,
              notas: `Pucho transferido desde ${cleanUidOrigen}`
            })
            .select('id_etiqueta')
            .single()

          finalUidDestino = generatedUidDestino
          destEtiquetaId = insPucho?.id_etiqueta || null
        }
      }
    } else {
      // PALETA COMPLETA: rellenar el menor hueco libre
      if (vaciaTagToReactivate) {
        await supabase
          .from('etiqueta_rfid')
          .update({
            id_producto: origTag.id_producto,
            tipo_paleta: 'COMPLETO',
            cantidad_paquetes: transferBoxes,
            cantidad_actual: transferUnits,
            estado: 'ACTIVA',
            id_almacen_actual: idAlmacenDestino,
            id_celda: null,
            notas: `Transferida desde ${cleanUidOrigen} (hueco rellenado)`
          })
          .eq('id_etiqueta', vaciaTagToReactivate.id_etiqueta)

        finalUidDestino = generatedUidDestino
        destEtiquetaId = vaciaTagToReactivate.id_etiqueta
      } else {
        const { data: insComp, error: insErr } = await supabase
          .from('etiqueta_rfid')
          .insert({
            uid_tag: generatedUidDestino,
            id_producto: origTag.id_producto,
            tipo_paleta: 'COMPLETO',
            cantidad_paquetes: transferBoxes,
            cantidad_actual: transferUnits,
            estado: 'ACTIVA',
            id_almacen_actual: idAlmacenDestino,
            notas: `Transferida desde ${cleanUidOrigen}`
          })
          .select('id_etiqueta')
          .single()

        if (insErr) {
          await supabase
            .from('etiqueta_rfid')
            .update({
              id_producto: origTag.id_producto,
              tipo_paleta: 'COMPLETO',
              cantidad_paquetes: transferBoxes,
              cantidad_actual: transferUnits,
              estado: 'ACTIVA',
              id_almacen_actual: idAlmacenDestino,
              id_celda: null,
              notas: `Transferida desde ${cleanUidOrigen}`
            })
            .eq('uid_tag', generatedUidDestino)
        }

        finalUidDestino = generatedUidDestino
        destEtiquetaId = insComp?.id_etiqueta || null
      }
    }

    // Actualizar secuencia_rfid para evitar colisiones futuras
    try {
      await supabase
        .from('secuencia_rfid')
        .upsert(
          { id_almacen: idAlmacenDestino, ultimo_numero: nextNum },
          { onConflict: 'id_almacen' }
        )
    } catch {}

    // F. Cerrar la etiqueta de origen (estado VACIA)
    try {
      await supabase
        .from('etiqueta_rfid')
        .update({
          estado: 'VACIA',
          cantidad_actual: 0,
          cantidad_paquetes: 0,
          id_almacen_actual: null,
          id_celda: null,
          notas: `Transferida a ${finalUidDestino} (${destName})`
        })
        .eq('uid_tag', cleanUidOrigen)
    } catch {}

    // G. Actualizar Inventario en Almacén Origen (Descuento de Stock)
    try {
      const { data: invOrig } = await supabase
        .from('inventario')
        .select('stock_real, stock_minimo')
        .eq('id_almacen', idAlmacenOrigen)
        .eq('id_producto', origTag.id_producto)
        .maybeSingle()

      if (invOrig) {
        const newStockOrig = Math.max(0, (Number(invOrig.stock_real) || 0) - transferUnits)
        const minStock = invOrig.stock_minimo || 100
        const semOrig = newStockOrig <= 0 ? 'ROJO' : newStockOrig <= minStock ? 'AMARILLO' : 'VERDE'

        await supabase
          .from('inventario')
          .update({
            stock_real: newStockOrig,
            estado_semaforo: semOrig
          })
          .eq('id_almacen', idAlmacenOrigen)
          .eq('id_producto', origTag.id_producto)
      }
    } catch {}

    // H. Actualizar Inventario en Almacén Destino (Suma de Stock)
    try {
      const { data: invDest } = await supabase
        .from('inventario')
        .select('stock_real, stock_minimo')
        .eq('id_almacen', idAlmacenDestino)
        .eq('id_producto', origTag.id_producto)
        .maybeSingle()

      const currDestStock = invDest ? Number(invDest.stock_real) || 0 : 0
      const newStockDest = currDestStock + transferUnits
      const minStockDest = invDest?.stock_minimo || 100
      const semDest = newStockDest <= 0 ? 'ROJO' : newStockDest <= minStockDest ? 'AMARILLO' : 'VERDE'

      await supabase
        .from('inventario')
        .upsert(
          {
            id_almacen: idAlmacenDestino,
            id_producto: origTag.id_producto,
            stock_real: newStockDest,
            stock_minimo: minStockDest,
            estado_semaforo: semDest
          },
          { onConflict: 'id_producto,id_almacen' }
        )
    } catch {}

    // I. Asentar asientos de Kardex
    try {
      await supabase.from('movimiento').insert({
        id_etiqueta: origTag.id_etiqueta || null,
        id_producto: origTag.id_producto,
        tipo: 'DESPACHO_COMPLETO',
        cantidad_afectada: transferUnits,
        destino_almacen: idAlmacenDestino,
        motivo: `Transferencia: sale ${cleanUidOrigen}, entra ${finalUidDestino}. ${motivo}`
      })

      await supabase.from('movimiento').insert({
        id_etiqueta: destEtiquetaId,
        id_producto: origTag.id_producto,
        tipo: origTag.tipo_paleta === 'COMPLETO' ? 'INGRESO_COMPLETO' : 'INGRESO_PUCHO',
        cantidad_afectada: transferUnits,
        destino_almacen: idAlmacenDestino,
        motivo: `Transferencia: ingresa a ${destName} desde ${cleanUidOrigen}. ${motivo}`
      })
    } catch {}

    // J. Sincronizar Caches Locales
    this.syncLocalPalletTransfer(cleanUidOrigen, finalUidDestino, idAlmacenOrigen, idAlmacenDestino, {
      id_producto: origTag.id_producto,
      tipo_paleta: origTag.tipo_paleta,
      cantidad_paquetes: transferBoxes,
      cantidad_actual: transferUnits,
      producto: origTag.producto
    })

    return {
      ok: true,
      uid_origen: cleanUidOrigen,
      uid_destino: finalUidDestino,
      uid_pucho_cerrado: uidPuchoCerrado,
      alerta_generada: alertaGenerada,
      unidades_transferidas: transferUnits,
      mensaje: `Transferencia exitosa: Paleta [${cleanUidOrigen}] transferida a "${destName}". Nuevo código generado: [${finalUidDestino}] (${transferUnits.toLocaleString()} unid.).`
    }
  },

  // Despacho o salida definitiva fuera de la empresa (Venta, Despacho a cliente, Merma externa, etc.)
  // Libera el código de la paleta (pasa a VACIA) y descuenta el stock de origen SIN generar nuevo tag en otro almacén.
  async dispatchPalletOutside(payload: {
    palletId: number
    uidTag: string
    warehouseId: number
    productId: number
    units: number
    cajas: number
    tipoSalida: string
    destinatario?: string
    documento?: string
    motivo: string
  }): Promise<{ ok: boolean; mensaje: string }> {
    const cleanTag = payload.uidTag.trim().toUpperCase()
    const fullReason = `Salida externa [${payload.tipoSalida}]: ${payload.documento ? `Doc: ${payload.documento}. ` : ''}${payload.destinatario ? `Destino: ${payload.destinatario}. ` : ''}${payload.motivo.trim()}`

    // 1. Invocar RPC dar_baja_etiqueta_rfid oficial
    try {
      const { data, error: rpcErr } = await supabase.rpc('dar_baja_etiqueta_rfid', {
        p_uid_tag: cleanTag,
        p_motivo: fullReason
      })
      if (!rpcErr && data && data.ok) {
        this.saveLocalPalletDecommission(payload.palletId, payload.warehouseId, cleanTag)
        return {
          ok: true,
          mensaje: `Paleta [${cleanTag}] despachada fuera de la empresa exitosamente (${payload.units.toLocaleString()} unid.). Código liberado.`
        }
      }
      if (rpcErr) {
        console.warn('[dispatchPalletOutside] RPC advertencia, ejecutando fallback directo:', rpcErr.message)
      }
    } catch (err: any) {
      console.warn('[dispatchPalletOutside] RPC excepción, ejecutando fallback directo:', err?.message)
    }

    // 2. Fallback directo en caso de sesión o RLS:
    try {
      // a. Descontar inventario contable en almacén de origen
      const { data: invRow } = await supabase
        .from('inventario')
        .select('stock_real, stock_minimo, consumo_abs')
        .eq('id_producto', payload.productId)
        .eq('id_almacen', payload.warehouseId)
        .maybeSingle()

      if (invRow) {
        const nuevoStock = Math.max(0, Number(invRow.stock_real) - payload.units)
        const nuevoConsumo = (Number(invRow.consumo_abs) || 0) + payload.units
        const semaforo = nuevoStock <= 0 ? 'ROJO' : nuevoStock <= (invRow.stock_minimo || 0) ? 'AMARILLO' : 'VERDE'

        await supabase
          .from('inventario')
          .update({
            stock_real: nuevoStock,
            consumo_abs: nuevoConsumo,
            estado_semaforo: semaforo
          })
          .eq('id_producto', payload.productId)
          .eq('id_almacen', payload.warehouseId)
      }

      // b. Registrar en Kardex movimiento DESPACHO_COMPLETO con destino_almacen: null
      await supabase.from('movimiento').insert({
        id_etiqueta: payload.palletId,
        id_producto: payload.productId,
        tipo: 'DESPACHO_COMPLETO',
        cantidad_afectada: payload.units,
        destino_almacen: null,
        motivo: fullReason
      })

      // c. Actualizar etiqueta a estado VACIA (libera el código, sin generar ningún tag en otro almacén)
      await supabase
        .from('etiqueta_rfid')
        .update({
          estado: 'VACIA',
          cantidad_paquetes: 0,
          cantidad_actual: 0,
          id_almacen_actual: null,
          id_celda: null,
          notas: fullReason
        })
        .eq('id_etiqueta', payload.palletId)

      this.saveLocalPalletDecommission(payload.palletId, payload.warehouseId, cleanTag)

      return {
        ok: true,
        mensaje: `Paleta [${cleanTag}] despachada fuera de la empresa exitosamente (${payload.units.toLocaleString()} unid.). Código liberado.`
      }
    } catch (err: any) {
      throw new Error(`Error despachando paleta fuera de la empresa: ${err.message}`)
    }
  },

  // Obtener conteos de paletas reales desde la vista v_conteo_paletas_almacen
  async getWarehousePalletCounts(warehouseId: number): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('v_conteo_paletas_almacen')
        .select('*')
        .eq('id_almacen', warehouseId)

      if (!error && data) return data
    } catch {}
    return []
  },

  // Obtener alertas no resueltas del sistema (alerta_sistema)
  async getSystemAlerts(idAlmacen?: number): Promise<any[]> {
    try {
      let q = supabase
        .from('alerta_sistema')
        .select('*')
        .eq('resuelta', false)
        .order('created_at', { ascending: false })

      if (idAlmacen) {
        q = q.eq('id_almacen', idAlmacen)
      }

      const { data, error } = await q
      if (!error && data) return data
    } catch {}
    return []
  },

  // Resolver alerta del sistema mediante la RPC resolver_alerta
  async resolveAlert(idAlerta: number): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('resolver_alerta', {
        p_id_alerta: idAlerta
      })
      if (!error && data?.ok) return true
    } catch {}
    return false
  },

  // Sugerir el menor código RFID libre (rellenando huecos de menor a mayor)
  async suggestNextRfidTag(warehouseId: number, prefijo?: string): Promise<string> {
    // 1. Intentar primero invocar la RPC oficial en Supabase (sugerir_uid_rfid)
    try {
      const { data: rpcTag, error: rpcErr } = await supabase.rpc('sugerir_uid_rfid', {
        p_id_almacen: warehouseId
      })
      if (!rpcErr && rpcTag) {
        return rpcTag
      }
    } catch {}

    let prefix = prefijo?.trim().toUpperCase()
    if (!prefix) {
      try {
        const { data: wh } = await supabase
          .from('almacen')
          .select('prefijo_rfid')
          .eq('id_almacen', warehouseId)
          .maybeSingle()
        if (wh?.prefijo_rfid) prefix = wh.prefijo_rfid.trim().toUpperCase()
      } catch {}
    }
    prefix = prefix || `ALM${warehouseId}`

    try {
      // 2. Fallback de cliente: obtener todas las etiquetas con este prefijo
      const { data: tags } = await supabase
        .from('etiqueta_rfid')
        .select('uid_tag, estado')
        .ilike('uid_tag', `${prefix}%`)

      const occupied = new Set<number>()
      if (tags && tags.length > 0) {
        for (const t of tags) {
          if (t.estado === 'ACTIVA') {
            const numStr = t.uid_tag.slice(prefix.length).replace(/\D/g, '')
            if (numStr) occupied.add(parseInt(numStr, 10))
          }
        }
      }

      // 2. Buscar de menor a mayor el primer hueco libre (N=1, 2, 3...)
      let nextNum = 1
      while (occupied.has(nextNum)) {
        nextNum++
      }

      return `${prefix}${nextNum.toString().padStart(5, '0')}`
    } catch {}

    return `${prefix}00001`
  },

  // Resetear y limpiar todos los datos operativos de prueba a 0
  async resetAllOperationalData(): Promise<{ success: boolean; mensaje: string }> {
    try {
      // 1. Limpiar auditorías y recepciones
      await supabase.from('auditoria_sesion_lectura').delete().neq('id_lectura', 0)
      await supabase.from('auditoria_eri').delete().neq('id_auditoria', 0)
      await supabase.from('conciliacion_ciega').delete().neq('id_conciliacion', 0)
      await supabase.from('recepcion_lectura').delete().neq('id_lectura', 0)
      await supabase.from('sesion_recepcion').delete().neq('id_sesion', 0)
      await supabase.from('movimiento').delete().neq('id_movimiento', 0)

      // 2. Eliminar todas las paletas físicas
      await supabase.from('etiqueta_rfid').delete().neq('id_etiqueta', 0)

      // 3. Resetear todo el inventario contable a 0
      await supabase
        .from('inventario')
        .update({ stock_real: 0, estado_semaforo: 'ROJO' })
        .neq('id_inventario', 0)
    } catch {
      // Fallback si RLS o error parcial
    }

    // 4. Limpiar almacenamiento local
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith('shalom_audit_'))) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    } catch {}

    return {
      success: true,
      mensaje: 'Sistema reiniciado exitosamente. Todas las paletas fueron eliminadas y el stock se encuentra en 0.'
    }
  },

  // --- MÉTODOS LOCALES / DEMO SEED ---

  getLocalLanes(warehouseId: number): WarehouseLane[] {
    const key = `${STORAGE_PREFIX}lanes_${warehouseId}`
    const raw = localStorage.getItem(key)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {
        return []
      }
    }

    // Por requerimiento: al crear un nuevo almacén NO se auto-crean carriles.
    // El usuario debe configurarlos manualmente con el botón "Configurar nuevo carril".
    return []
  },

  getLocalCells(warehouseId: number): RackCell[] {
    const key = `${STORAGE_PREFIX}cells_${warehouseId}`
    const raw = localStorage.getItem(key)
    let cells: RackCell[] = []

    if (raw) {
      try {
        cells = JSON.parse(raw)
      } catch {
        cells = []
      }
    }

    const lanes = this.getLocalLanes(warehouseId)

    // Si ya existían celdas en cache local, filtrar aquellas pertenecientes a carriles inexistentes
    if (cells.length > 0) {
      const laneIds = new Set(lanes.map((l) => l.id_carril))
      const validCells = cells.filter((c) => c.tipo_ubicacion === 'CAMPO' || (c.id_carril && laneIds.has(c.id_carril)))
      if (validCells.length !== cells.length) {
        cells = validCells
        localStorage.setItem(key, JSON.stringify(cells))
      }
    }

    if (cells.length === 0) {
      // 1. Zona Campo (siempre presente en todo almacén para carga libre/sobredimensionada)
      cells.push({
        id_celda: 9999 + warehouseId,
        id_almacen: warehouseId,
        tipo_ubicacion: 'CAMPO',
        id_carril: null,
        id_nivel: null,
        posicion_fondo: null,
        codigo_ubicacion: `ALM${warehouseId}-CAMPO`,
        descripcion: 'Zona de Piso / Estiba Libre para Productos Sobredimensionados',
        activo: true,
        paleta_ocupante: null
      })

      // 2. Celdas de Racks Drive-In (solo si el usuario ya configuró carriles)
      let idCounter = 1
      for (const lane of lanes) {
        for (const nivel of lane.niveles) {
          for (let p = 1; p <= nivel.capacidad_paletas; p++) {
            const pCode = p.toString().padStart(2, '0')
            const nCode = nivel.numero_nivel.toString().padStart(2, '0')
            cells.push({
              id_celda: idCounter++,
              id_almacen: warehouseId,
              tipo_ubicacion: 'RACK',
              id_carril: lane.id_carril,
              id_nivel: nivel.id_nivel,
              posicion_fondo: p,
              codigo_ubicacion: `${lane.codigo_carril}-N${nCode}-P${pCode}`,
              descripcion: `${lane.nombre} · Nivel ${nivel.numero_nivel} · Fondo Pos ${p}`,
              activo: true,
              paleta_ocupante: null
            })
          }
        }
      }
      localStorage.setItem(key, JSON.stringify(cells))
    }

    // Unir con las paletas asignadas localmente
    const pallets = this.getLocalPallets(warehouseId)
    for (const cell of cells) {
      const p = pallets.find((item) => item.id_celda && Number(item.id_celda) === Number(cell.id_celda) && item.estado !== 'VACIA')
      if (p) {
        cell.paleta_ocupante = {
          id_etiqueta: p.id_etiqueta,
          uid_tag: p.uid_tag,
          codigo_barras: p.codigo_barras,
          id_producto: p.id_producto,
          producto_sku: p.producto?.sku || 'SKU-SHALOM',
          producto_nombre: p.producto?.nombre || 'Producto en Estantería',
          tipo_paleta: p.tipo_paleta,
          cantidad_paquetes: p.cantidad_paquetes,
          cantidad_actual: p.cantidad_actual,
          fecha_enrolamiento: new Date().toISOString()
        }
      } else {
        cell.paleta_ocupante = null
      }
    }

    return cells
  },

  getLocalPallets(warehouseId: number): PalletRecord[] {
    purgeLegacyZombiePallets()

    const key = `${STORAGE_PREFIX}pallets_${warehouseId}`
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try {
        return JSON.parse(raw)
      } catch {
        return []
      }
    }

    // Cada almacén inicia limpio con 0 paletas (sin autoseed fantasma al cambiar de almacén)
    localStorage.setItem(key, JSON.stringify([]))
    return []
  },

  saveLocalLane(
    warehouseId: number,
    codigoCarril: string,
    nombre: string,
    niveles: { numero_nivel: number; capacidad_paletas: number }[]
  ): boolean {
    const lanesKey = `${STORAGE_PREFIX}lanes_${warehouseId}`
    const lanes = this.getLocalLanes(warehouseId)
    const existingIndex = lanes.findIndex((l) => l.codigo_carril === codigoCarril)

    const laneId = existingIndex >= 0 ? lanes[existingIndex].id_carril : Date.now()
    const newLane: WarehouseLane = {
      id_carril: laneId,
      id_almacen: warehouseId,
      codigo_carril: codigoCarril,
      nombre: nombre || `Carril ${codigoCarril}`,
      activo: true,
      niveles: niveles.map((n, i) => ({
        id_nivel: laneId * 10 + (i + 1),
        id_carril: laneId,
        numero_nivel: n.numero_nivel,
        nombre_nivel: `Nivel ${n.numero_nivel}`,
        capacidad_paletas: n.capacidad_paletas
      }))
    }

    if (existingIndex >= 0) {
      lanes[existingIndex] = newLane
    } else {
      lanes.push(newLane)
    }

    localStorage.setItem(lanesKey, JSON.stringify(lanes))

    // Regenerar celdas locales para reflejar la nueva capacidad
    localStorage.removeItem(`${STORAGE_PREFIX}cells_${warehouseId}`)
    this.getLocalCells(warehouseId)
    return true
  },

  saveLocalPalletCellAssignment(palletId: number, cellId: number, warehouseId: number): boolean {
    const pallets = this.getLocalPallets(warehouseId)
    const cellsKey = `${STORAGE_PREFIX}cells_${warehouseId}`
    const cells = this.getLocalCells(warehouseId)
    const targetCell = cells.find((c) => Number(c.id_celda) === Number(cellId))

    const isCampo = targetCell?.tipo_ubicacion === 'CAMPO' ||
      targetCell?.codigo_ubicacion?.includes('CAMPO') ||
      Number(cellId) >= 9999
    const resolvedUbi = targetCell?.codigo_ubicacion || (isCampo ? `ALM${warehouseId}-CAMPO` : null)
    const resolvedTipo: LocationType = isCampo ? 'CAMPO' : (targetCell?.tipo_ubicacion || 'RACK')

    let palletIndex = pallets.findIndex((p) => String(p.id_etiqueta) === String(palletId))

    if (palletIndex < 0) {
      // Si la paleta no estaba en el array de este almacén, buscarla en otros almacenes
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(`${STORAGE_PREFIX}pallets_`)) {
          try {
            const list: PalletRecord[] = JSON.parse(localStorage.getItem(k) || '[]')
            const item = list.find((p) => String(p.id_etiqueta) === String(palletId))
            if (item) {
              const copied = { ...item, id_almacen_actual: warehouseId }
              pallets.push(copied)
              palletIndex = pallets.length - 1
              break
            }
          } catch {}
        }
      }
    }

    if (palletIndex >= 0) {
      pallets[palletIndex].id_celda = cellId
      pallets[palletIndex].id_almacen_actual = warehouseId
      pallets[palletIndex].codigo_ubicacion = resolvedUbi
      pallets[palletIndex].tipo_ubicacion = resolvedTipo
      localStorage.setItem(`${STORAGE_PREFIX}pallets_${warehouseId}`, JSON.stringify(pallets))

      if (targetCell) {
        targetCell.paleta_ocupante = {
          id_etiqueta: pallets[palletIndex].id_etiqueta,
          uid_tag: pallets[palletIndex].uid_tag,
          codigo_barras: pallets[palletIndex].codigo_barras,
          id_producto: pallets[palletIndex].id_producto,
          producto_sku: pallets[palletIndex].producto?.sku || 'SKU',
          producto_nombre: pallets[palletIndex].producto?.nombre || 'Producto',
          tipo_paleta: pallets[palletIndex].tipo_paleta,
          cantidad_paquetes: pallets[palletIndex].cantidad_paquetes,
          cantidad_actual: pallets[palletIndex].cantidad_actual,
          fecha_enrolamiento: new Date().toISOString()
        }
        localStorage.setItem(cellsKey, JSON.stringify(cells))
      }
      return true
    }
    return false
  },

  saveLocalPalletUnassign(palletId?: number | null, cellId?: number | null, _warehouseId?: number): boolean {
    let found = false
    const cleanPalletId = palletId ? String(palletId) : null
    const cleanCellId = cellId ? Number(cellId) : null

    // Snapshot estático de claves para evitar inconsistencias por mutación durante la iteración
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }

    for (const key of keys) {
      if (key.startsWith(`${STORAGE_PREFIX}pallets_`)) {
        try {
          const pallets: PalletRecord[] = JSON.parse(localStorage.getItem(key) || '[]')
          let pChanged = false
          for (const p of pallets) {
            const matchPallet = cleanPalletId !== null && String(p.id_etiqueta) === cleanPalletId
            const matchCell = cleanCellId !== null && Number(p.id_celda) === cleanCellId
            if (matchPallet || matchCell) {
              p.id_celda = null
              p.codigo_ubicacion = null
              pChanged = true
              found = true
            }
          }
          if (pChanged) {
            localStorage.setItem(key, JSON.stringify(pallets))
          }
        } catch {}
      } else if (key.startsWith(`${STORAGE_PREFIX}cells_`)) {
        try {
          const cells: RackCell[] = JSON.parse(localStorage.getItem(key) || '[]')
          let cChanged = false
          for (const cell of cells) {
            const matchCell = cleanCellId !== null && Number(cell.id_celda) === cleanCellId
            const matchPallet = cleanPalletId !== null && String(cell.paleta_ocupante?.id_etiqueta) === cleanPalletId
            if (matchCell || matchPallet) {
              cell.paleta_ocupante = null
              cChanged = true
              found = true
            }
          }
          if (cChanged) {
            localStorage.setItem(key, JSON.stringify(cells))
          }
        } catch {}
      }
    }
    return found
  },

  saveLocalLaneUnassign(laneId: number, warehouseId: number): number {
    let count = 0
    const cellsKey = `${STORAGE_PREFIX}cells_${warehouseId}`
    const palletsKey = `${STORAGE_PREFIX}pallets_${warehouseId}`

    try {
      const cells: RackCell[] = JSON.parse(localStorage.getItem(cellsKey) || '[]')
      const targetCellIds = new Set<number>()

      for (const cell of cells) {
        if (cell.id_carril === laneId) {
          targetCellIds.add(cell.id_celda)
          if (cell.paleta_ocupante) {
            cell.paleta_ocupante = null
            count++
          }
        }
      }
      localStorage.setItem(cellsKey, JSON.stringify(cells))

      const pallets: PalletRecord[] = JSON.parse(localStorage.getItem(palletsKey) || '[]')
      for (const p of pallets) {
        if (p.id_celda && targetCellIds.has(p.id_celda)) {
          p.id_celda = null
          p.codigo_ubicacion = null
        }
      }
      localStorage.setItem(palletsKey, JSON.stringify(pallets))
    } catch {}

    return count
  },

  createLocalPallet(data: {
    id_producto: number
    id_almacen: number
    uid_tag: string
    codigo_barras?: string
    tipo_paleta: 'COMPLETO' | 'PUCHO'
    cantidad_paquetes: number
    id_celda?: number | null
    sku?: string
    nombre?: string
  }): PalletRecord {
    const cleanTag = data.uid_tag.trim().toUpperCase()
    // Si ya existía una paleta con ese tag, eliminarla para permitir reusar el código con el nuevo producto
    const pallets = this.getLocalPallets(data.id_almacen).filter((p) => p.uid_tag !== cleanTag)
    const cells = this.getLocalCells(data.id_almacen)
    const cell = data.id_celda ? cells.find((c) => Number(c.id_celda) === Number(data.id_celda)) : null

    const isCampo = cell?.tipo_ubicacion === 'CAMPO' ||
      cell?.codigo_ubicacion?.includes('CAMPO') ||
      Number(data.id_celda) >= 9999
    const resolvedUbi = cell?.codigo_ubicacion || (isCampo ? `ALM${data.id_almacen}-CAMPO` : null)
    const resolvedTipo: LocationType = isCampo ? 'CAMPO' : (cell?.tipo_ubicacion || 'RACK')

    const newPallet: PalletRecord = {
      id_etiqueta: Date.now(),
      uid_tag: cleanTag,
      codigo_barras: data.codigo_barras?.trim().toUpperCase() || null,
      id_producto: data.id_producto,
      id_almacen_actual: data.id_almacen,
      id_celda: data.id_celda || null,
      codigo_ubicacion: resolvedUbi,
      tipo_ubicacion: resolvedTipo,
      tipo_paleta: data.tipo_paleta,
      cantidad_paquetes: data.cantidad_paquetes,
      cantidad_actual: data.cantidad_paquetes,
      estado: 'ACTIVA',
      producto: {
        sku: data.sku || 'SKU-NUEVO',
        nombre: data.nombre || 'Producto'
      }
    }

    pallets.push(newPallet)
    localStorage.setItem(`${STORAGE_PREFIX}pallets_${data.id_almacen}`, JSON.stringify(pallets))

    // Si se asignó a una celda, actualizar también la celda local
    if (cell) {
      cell.paleta_ocupante = {
        id_etiqueta: newPallet.id_etiqueta,
        uid_tag: newPallet.uid_tag,
        codigo_barras: newPallet.codigo_barras,
        id_producto: newPallet.id_producto,
        producto_sku: newPallet.producto?.sku || 'SKU',
        producto_nombre: newPallet.producto?.nombre || 'Producto',
        tipo_paleta: newPallet.tipo_paleta,
        cantidad_paquetes: newPallet.cantidad_paquetes,
        cantidad_actual: newPallet.cantidad_actual,
        fecha_enrolamiento: new Date().toISOString()
      }
      localStorage.setItem(`${STORAGE_PREFIX}cells_${data.id_almacen}`, JSON.stringify(cells))
    }

    return newPallet
  },

  saveLocalPalletDecommission(palletId: number, warehouseId: number, uidTag?: string): boolean {
    const cleanTag = uidTag?.trim().toUpperCase()

    // 1. Limpiar de pallets del almacén actual
    const pKey = `${STORAGE_PREFIX}pallets_${warehouseId}`
    const rawP = localStorage.getItem(pKey)
    if (rawP) {
      try {
        const pallets: PalletRecord[] = JSON.parse(rawP)
        const updated = pallets.filter(
          (p) => p.id_etiqueta !== palletId && (!cleanTag || p.uid_tag?.trim().toUpperCase() !== cleanTag)
        )
        localStorage.setItem(pKey, JSON.stringify(updated))
      } catch {
        localStorage.setItem(pKey, JSON.stringify([]))
      }
    } else {
      localStorage.setItem(pKey, JSON.stringify([]))
    }

    // 2. Limpiar de celdas del almacén actual (tanto RACK como CAMPO)
    const cKey = `${STORAGE_PREFIX}cells_${warehouseId}`
    const rawC = localStorage.getItem(cKey)
    if (rawC) {
      try {
        const cells: RackCell[] = JSON.parse(rawC)
        let changed = false
        for (const cell of cells) {
          if (
            cell.paleta_ocupante &&
            (cell.paleta_ocupante.id_etiqueta === palletId ||
              (cleanTag && cell.paleta_ocupante.uid_tag?.trim().toUpperCase() === cleanTag))
          ) {
            cell.paleta_ocupante = null
            changed = true
          }
        }
        if (changed) {
          localStorage.setItem(cKey, JSON.stringify(cells))
        }
      } catch {
        // Ignorar
      }
    }

    // 3. Barrido defensivo en todos los almacenes guardados en localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      if (key.startsWith(`${STORAGE_PREFIX}pallets_`)) {
        try {
          const list: PalletRecord[] = JSON.parse(localStorage.getItem(key) || '[]')
          const filtered = list.filter(
            (p) => p.id_etiqueta !== palletId && (!cleanTag || p.uid_tag?.trim().toUpperCase() !== cleanTag)
          )
          if (filtered.length !== list.length) {
            localStorage.setItem(key, JSON.stringify(filtered))
          }
        } catch {
          // Continuar
        }
      } else if (key.startsWith(`${STORAGE_PREFIX}cells_`)) {
        try {
          const cellsList: RackCell[] = JSON.parse(localStorage.getItem(key) || '[]')
          let cChanged = false
          for (const cell of cellsList) {
            if (
              cell.paleta_ocupante &&
              (cell.paleta_ocupante.id_etiqueta === palletId ||
                (cleanTag && cell.paleta_ocupante.uid_tag?.trim().toUpperCase() === cleanTag))
            ) {
              cell.paleta_ocupante = null
              cChanged = true
            }
          }
          if (cChanged) {
            localStorage.setItem(key, JSON.stringify(cellsList))
          }
        } catch {
          // Continuar
        }
      }
    }

    return true
  }
}
