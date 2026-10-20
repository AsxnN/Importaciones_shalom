import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { logCatalogChange } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { locationService } from '../services/locationService'
import type { PalletRecord } from '../types/locations'
import { PalletDecommissionSubView } from './inventory/PalletDecommissionSubView'
import { RackLocationsSubView } from './inventory/RackLocationsSubView'

type Warehouse = {
  id_almacen: number
  nombre: string
  tipo: 'PRINCIPAL' | 'TIENDA' | 'MERMA'
  capacidad_m3: number | null
  activo: boolean
  prefijo_rfid?: string | null
}

type PalletCountSummary = {
  id_almacen: number
  almacen: string
  id_producto: number
  sku: string
  producto: string
  paletas_activas: number
  paletas_completas: number
  puchos: number
  unidades_en_paletas: number
}

type SystemAlert = {
  id_alerta: number
  tipo: string
  id_almacen: number | null
  id_producto: number | null
  id_etiqueta: number | null
  mensaje: string
  resuelta: boolean
  created_at: string
}

type ProductOption = {
  id_producto: number
  sku: string
  nombre: string
  unidades_por_caja: number
  cajas_por_paleta: number
  volumen_caja_m3: number | null
}

type InventoryItem = {
  id_inventario: number
  id_producto: number
  id_almacen: number
  stock_real: number
  stock_minimo: number
  estado_semaforo: 'VERDE' | 'AMARILLO' | 'ROJO'
  producto: {
    sku: string
    nombre: string
    clasificacion_abc: string | null
    unidad_medida: string | null
    categoria?: { nombre: string } | null
    regla_empaque?: {
      unidades_por_caja: number
      cajas_por_camada?: number
      numero_camadas?: number
      cajas_por_camita?: number
      camitas_por_paleta?: number
      volumen_caja_m3?: number | null
      volumen_total_m3?: number | null
    }[] | {
      unidades_por_caja: number
      cajas_por_camada?: number
      numero_camadas?: number
      cajas_por_camita?: number
      camitas_por_paleta?: number
      volumen_caja_m3?: number | null
      volumen_total_m3?: number | null
    } | null
  }
}

type Movement = {
  id_movimiento: number
  tipo: string
  cantidad_afectada: number
  fecha_hora: string
  motivo: string | null
  producto: { sku: string; nombre: string } | null
}

export function InventoryPage({ onBack }: { onBack: () => void }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [showZeroStock, setShowZeroStock] = useState<boolean>(false)
  const [movements, setMovements] = useState<Movement[]>([])
  const [allProducts, setAllProducts] = useState<ProductOption[]>([])
  
  const [loading, setLoading] = useState(true)
  const [loadingStock, setLoadingStock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [currentTab, setCurrentTab] = useState<'stock' | 'paletas' | 'ubicaciones' | 'movimientos' | 'almacenes'>('stock')
  const [filterPalletSku, setFilterPalletSku] = useState('')
  const [activePallets, setActivePallets] = useState<PalletRecord[]>([])
  const [palletCountsMap, setPalletCountsMap] = useState<Map<number, PalletCountSummary>>(new Map())
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([])

  // Modal de Ingreso de Paleta RFID / Ajuste
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [modalMode, setModalMode] = useState<'rfid' | 'manual'>('rfid')
  const [modalProdId, setModalProdId] = useState<string>('')
  const [modalUidTag, setModalUidTag] = useState<string>('')
  const [modalTipoPaleta, setModalTipoPaleta] = useState<'COMPLETO' | 'PUCHO'>('COMPLETO')
  const [modalCajasPucho, setModalCajasPucho] = useState<string>('1')
  const [modalPaletas, setModalPaletas] = useState<string>('0')
  const [modalPuchos, setModalPuchos] = useState<string>('0')
  const [modalMotivo, setModalMotivo] = useState<string>('Ingreso de paleta por recepción')
  const [savingAdjust, setSavingAdjust] = useState(false)

  // Modal y Estado de CRUD para Almacenes
  const [showWhModal, setShowWhModal] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [whNombre, setWhNombre] = useState('')
  const [whPrefijo, setWhPrefijo] = useState('')
  const [whPrefijoCustom, setWhPrefijoCustom] = useState(false)
  const [whTipo, setWhTipo] = useState<'PRINCIPAL' | 'TIENDA' | 'MERMA'>('PRINCIPAL')
  const [whCapacidad, setWhCapacidad] = useState('100')
  const [whActivo, setWhActivo] = useState(true)
  const [savingWh, setSavingWh] = useState(false)

  // Cargar Almacenes y Productos
  async function loadInitialData(selectWhId?: number) {
    setLoading(true)
    setError(null)

    // 1. Cargar Almacenes con su prefijo RFID
    const { data: whData, error: whErr } = await supabase
      .from('almacen')
      .select('id_almacen, nombre, tipo, capacidad_m3, activo, prefijo_rfid')
      .order('id_almacen')

    if (whErr) {
      setError(`Error cargando almacenes: ${whErr.message}`)
      setLoading(false)
      return
    }

    const whList = (whData as Warehouse[]) || []
    setWarehouses(whList)

    if (selectWhId) {
      setSelectedWarehouseId(selectWhId)
    } else if (whList.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(whList[0].id_almacen)
    }

    // 2. Cargar Catálogo de Productos con su Regla de Empaque para el Modal
    const { data: prodData } = await supabase
      .from('producto')
      .select('id_producto, sku, nombre, regla_empaque(unidades_por_caja, cajas_por_camada, numero_camadas, cajas_por_camita, camitas_por_paleta, volumen_caja_m3)')
      .eq('activo', true)
      .order('sku')

    if (prodData) {
      const opts: ProductOption[] = prodData.map((p: any) => {
        const r = Array.isArray(p.regla_empaque) ? p.regla_empaque[0] : p.regla_empaque
        const cCamada = r?.cajas_por_camada ?? r?.cajas_por_camita ?? 1
        const nCamadas = r?.numero_camadas ?? r?.camitas_por_paleta ?? 1
        return {
          id_producto: p.id_producto,
          sku: p.sku,
          nombre: p.nombre,
          unidades_por_caja: r?.unidades_por_caja ?? 1,
          cajas_por_paleta: cCamada * nCamadas,
          volumen_caja_m3: r?.volumen_caja_m3 ?? null
        }
      })
      setAllProducts(opts)
      if (opts.length > 0 && !modalProdId) {
        setModalProdId(String(opts[0].id_producto))
      }
    }

    setLoading(false)
  }

  // Cargar stock del almacén seleccionado
  async function loadWarehouseInventory(whId: number) {
    setLoadingStock(true)
    setError(null)

    // Asegurar catálogo de productos
    let currentProds = allProducts
    if (currentProds.length === 0) {
      const { data: pData } = await supabase
        .from('producto')
        .select('id_producto, sku, nombre, regla_empaque(unidades_por_caja, cajas_por_camada, numero_camadas, cajas_por_camita, camitas_por_paleta, volumen_caja_m3)')
        .eq('activo', true)
      if (pData) {
        currentProds = pData.map((p: any) => {
          const r = Array.isArray(p.regla_empaque) ? p.regla_empaque[0] : p.regla_empaque
          const cCamada = r?.cajas_por_camada ?? r?.cajas_por_camita ?? 1
          const nCamadas = r?.numero_camadas ?? r?.camitas_por_paleta ?? 1
          return {
            id_producto: p.id_producto,
            sku: p.sku,
            nombre: p.nombre,
            unidades_por_caja: r?.unidades_por_caja ?? 1,
            cajas_por_paleta: cCamada * nCamadas,
            volumen_caja_m3: r?.volumen_caja_m3 ?? null
          }
        })
        setAllProducts(currentProds)
      }
    }

    const { data, error: invErr } = await supabase
      .from('inventario')
      .select(`
        id_inventario,
        id_producto,
        id_almacen,
        stock_real,
        stock_minimo,
        estado_semaforo,
        producto (
          sku,
          nombre,
          clasificacion_abc,
          unidad_medida,
          categoria (nombre),
          regla_empaque (
            unidades_por_caja,
            cajas_por_camada,
            numero_camadas,
            cajas_por_camita,
            camitas_por_paleta,
            volumen_caja_m3,
            volumen_total_m3
          )
        )
      `)
      .eq('id_almacen', whId)

    if (invErr) {
      console.warn('[loadWarehouseInventory] Error consultando inventario:', invErr.message)
    }

    // Cargar movimientos de este almacén
    const { data: movData } = await supabase
      .from('movimiento')
      .select('id_movimiento, tipo, cantidad_afectada, fecha_hora, motivo, producto(sku, nombre)')
      .eq('destino_almacen', whId)
      .order('fecha_hora', { ascending: false })
      .limit(30)

    setMovements((movData as unknown as Movement[]) || [])

    // Cargar paletas físicas reales registradas con RFID/Ubicación en este almacén
    let pList: PalletRecord[] = []
    try {
      pList = await locationService.getWarehousePallets(whId)
      setActivePallets(pList)
    } catch {
      setActivePallets([])
    }

    // Cargar conteos oficiales desde la vista v_conteo_paletas_almacen (Script 3)
    try {
      const counts = await locationService.getWarehousePalletCounts(whId)
      const cMap = new Map<number, PalletCountSummary>()
      for (const c of counts) {
        if (c.id_producto) {
          cMap.set(c.id_producto, c)
        }
      }
      setPalletCountsMap(cMap)
    } catch {
      setPalletCountsMap(new Map())
    }

    // Cargar alertas del sistema no resueltas (Script 1)
    try {
      const alerts = await locationService.getSystemAlerts(whId)
      setSystemAlerts(alerts)
    } catch {
      setSystemAlerts([])
    }

    // Reconciliación 1:1 entre inventario contable y paletas físicas reales
    const invItems: InventoryItem[] = (data as unknown as InventoryItem[]) || []
    const existingProdIds = new Set(invItems.map((item) => item.id_producto))

    // 1. Detectar productos que tienen paletas físicas reales pero no tienen fila en 'inventario'
    const missingFromInventory = new Map<number, PalletRecord[]>()
    for (const p of pList) {
      if (p.id_producto && !existingProdIds.has(p.id_producto)) {
        const cur = missingFromInventory.get(p.id_producto) || []
        cur.push(p)
        missingFromInventory.set(p.id_producto, cur)
      }
    }

    for (const [prodId, pallets] of missingFromInventory.entries()) {
      const prodInfo = currentProds.find((ap) => ap.id_producto === prodId)
      const samplePallet = pallets[0]
      const totalPhysicalUnits = pallets.reduce(
        (acc, p) => acc + (Number(p.cantidad_actual) || Number(p.cantidad_paquetes) || 0),
        0
      )
      const minStock = 100
      const semaforo = totalPhysicalUnits <= 0 ? 'ROJO' : totalPhysicalUnits <= minStock ? 'AMARILLO' : 'VERDE'

      const syntheticItem: InventoryItem = {
        id_inventario: -prodId,
        id_producto: prodId,
        id_almacen: whId,
        stock_real: totalPhysicalUnits,
        stock_minimo: minStock,
        estado_semaforo: semaforo,
        producto: {
          sku: prodInfo?.sku || samplePallet.producto?.sku || `SKU-${prodId}`,
          nombre: prodInfo?.nombre || samplePallet.producto?.nombre || 'Producto registrado',
          clasificacion_abc: 'A',
          unidad_medida: 'UND',
          categoria: { nombre: 'General' },
          regla_empaque: {
            unidades_por_caja: prodInfo?.unidades_por_caja || 1,
            cajas_por_camada: prodInfo?.cajas_por_paleta || 1,
            numero_camadas: 1,
            volumen_caja_m3: prodInfo?.volumen_caja_m3 || null
          }
        }
      }
      invItems.push(syntheticItem)

      // Auto-curación en Supabase: persistir la fila en la tabla inventario
      void supabase
        .from('inventario')
        .upsert(
          {
            id_almacen: whId,
            id_producto: prodId,
            stock_real: totalPhysicalUnits,
            stock_minimo: minStock,
            estado_semaforo: semaforo
          },
          { onConflict: 'id_producto,id_almacen' }
        )
    }

    // 2. Para productos existentes en 'inventario': si el stock contable es 0 pero hay paletas físicas reales
    for (const item of invItems) {
      const prodPallets = pList.filter((p) => p.id_producto === item.id_producto)
      if (prodPallets.length > 0) {
        const physUnits = prodPallets.reduce(
          (acc, p) => acc + (Number(p.cantidad_actual) || Number(p.cantidad_paquetes) || 0),
          0
        )
        if (physUnits > 0 && Number(item.stock_real) === 0) {
          item.stock_real = physUnits
          item.estado_semaforo = physUnits <= item.stock_minimo ? 'AMARILLO' : 'VERDE'
          void supabase
            .from('inventario')
            .update({
              stock_real: physUnits,
              estado_semaforo: item.estado_semaforo
            })
            .eq('id_almacen', whId)
            .eq('id_producto', item.id_producto)
        }
      }
    }

    setInventory(invItems)
    setLoadingStock(false)
  }

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedWarehouseId !== null) {
      setShowZeroStock(false)
      void loadWarehouseInventory(selectedWarehouseId)
    }
  }, [selectedWarehouseId])

  // Almacén actualmente seleccionado
  const selectedWarehouse = warehouses.find((w) => w.id_almacen === selectedWarehouseId)

  // Separar productos con existencias activas de los que tienen stock 0 y sin paletas físicas en este almacén
  const { activeItems, zeroStockItems } = useMemo(() => {
    const active: InventoryItem[] = []
    const zero: InventoryItem[] = []

    inventory.forEach((item) => {
      const stock = Number(item.stock_real) || 0
      const hasPallets = activePallets.some((p) => p.id_producto === item.id_producto)
      if (stock > 0 || hasPallets) {
        active.push(item)
      } else {
        zero.push(item)
      }
    })

    return { activeItems: active, zeroStockItems: zero }
  }, [inventory, activePallets])

  // Lista visible de inventario según el filtro
  const displayedInventory = showZeroStock ? inventory : activeItems

  // Cálculos consolidados del almacén usando existencias activas y paletas físicas reales
  const summary = useMemo(() => {
    let totalUnidades = 0
    let totalVolumenM3 = 0

    // Paletas físicas reales desde activePallets
    const paletasCompletasFisicas = activePallets.filter((p) => p.tipo_paleta === 'COMPLETO').length
    const puchosFisicos = activePallets.filter((p) => p.tipo_paleta === 'PUCHO').length
    const totalCajasPuchos = activePallets
      .filter((p) => p.tipo_paleta === 'PUCHO')
      .reduce((acc, p) => acc + (Number(p.cantidad_paquetes) || 1), 0)

    activeItems.forEach((item) => {
      const stock = Number(item.stock_real) || 0
      totalUnidades += stock

      const r = Array.isArray(item.producto?.regla_empaque)
        ? item.producto.regla_empaque[0]
        : item.producto?.regla_empaque

      const uCaja = Math.max(1, r?.unidades_por_caja || 1)
      const totalCajas = Math.floor(stock / uCaja)

      if (r?.volumen_caja_m3) {
        totalVolumenM3 += totalCajas * Number(r.volumen_caja_m3)
      }
    })

    const capacidad = selectedWarehouse?.capacidad_m3 || 500
    const pctOcupado = capacidad > 0 ? (totalVolumenM3 / capacidad) * 100 : 0

    return {
      totalUnidades,
      totalPaletas: paletasCompletasFisicas,
      totalPuchos: puchosFisicos,
      totalCajasPuchos,
      totalVolumenM3: Number(totalVolumenM3.toFixed(3)),
      pctOcupado: Math.min(100, Number(pctOcupado.toFixed(1))),
      itemsCount: activeItems.length
    }
  }, [activeItems, selectedWarehouse, activePallets])


  // Producto seleccionado en el modal de ajuste
  const modalSelectedProd = useMemo(() => {
    return allProducts.find((p) => String(p.id_producto) === modalProdId)
  }, [allProducts, modalProdId])

  // Cálculos en tiempo real del modal de ajuste / ingreso
  const modalPreview = useMemo(() => {
    if (!modalSelectedProd) return null
    const cPaleta = modalSelectedProd.cajas_por_paleta || 1
    const uCaja = modalSelectedProd.unidades_por_caja || 1

    if (modalMode === 'rfid') {
      const cajas = modalTipoPaleta === 'COMPLETO' ? cPaleta : Math.max(1, parseInt(modalCajasPucho) || 1)
      const totalUnidades = cajas * uCaja
      const volumenM3 = modalSelectedProd.volumen_caja_m3
        ? (cajas * modalSelectedProd.volumen_caja_m3).toFixed(3)
        : null

      return {
        pal: modalTipoPaleta === 'COMPLETO' ? 1 : 0,
        puch: modalTipoPaleta === 'PUCHO' ? cajas : 0,
        cajasPorPaleta: cPaleta,
        cajasDePaletas: modalTipoPaleta === 'COMPLETO' ? cPaleta : 0,
        totalCajas: cajas,
        totalUnidades,
        volumenM3
      }
    }

    const pal = Math.max(0, parseInt(modalPaletas) || 0)
    const puch = Math.max(0, parseInt(modalPuchos) || 0)

    const totalCajas = (pal * cPaleta) + puch
    const totalUnidades = totalCajas * uCaja
    const volumenM3 = modalSelectedProd.volumen_caja_m3
      ? (totalCajas * modalSelectedProd.volumen_caja_m3).toFixed(3)
      : null

    return {
      pal,
      puch,
      cajasPorPaleta: cPaleta,
      cajasDePaletas: pal * cPaleta,
      totalCajas,
      totalUnidades,
      volumenM3
    }
  }, [modalSelectedProd, modalMode, modalTipoPaleta, modalCajasPucho, modalPaletas, modalPuchos])

  // Guardar Ajuste / Ingreso de Paleta RFID
  async function handleSaveAdjustment(e: FormEvent) {
    e.preventDefault()
    if (!selectedWarehouseId || !modalProdId) return

    setSavingAdjust(true)
    setError(null)
    setSuccessMsg(null)

    // Modo 1: Registro manual de Paleta Física con código RFID
    if (modalMode === 'rfid') {
      const cleanTag = modalUidTag.trim().toUpperCase()
      if (!cleanTag) {
        setError('El código Tag RFID es obligatorio.')
        setSavingAdjust(false)
        return
      }

      const cPaleta = modalSelectedProd?.cajas_por_paleta || 1
      const uCaja = modalSelectedProd?.unidades_por_caja || 1
      const cajas = modalTipoPaleta === 'COMPLETO' ? cPaleta : Math.max(1, parseInt(modalCajasPucho) || 1)
      const unidades = cajas * uCaja

      try {
        await locationService.createPallet({
          id_producto: parseInt(modalProdId),
          id_almacen: selectedWarehouseId,
          uid_tag: cleanTag,
          codigo_barras: cleanTag,
          tipo_paleta: modalTipoPaleta,
          cantidad_paquetes: cajas,
          unidades_totales: unidades,
          sku: modalSelectedProd?.sku,
          nombre: modalSelectedProd?.nombre
        })

        setSuccessMsg(
          `Paleta RFID [${cleanTag}] registrada exitosamente: ${cajas} cajas (${unidades.toLocaleString()} unid.) ingresadas al inventario.`
        )
        setShowAdjustModal(false)
        setModalUidTag('')
        setModalCajasPucho('1')
        await loadWarehouseInventory(selectedWarehouseId)
      } catch (err: any) {
        setError(`Error al registrar paleta: ${err.message}`)
      } finally {
        setSavingAdjust(false)
      }
      return
    }

    // Modo 2: Ajuste Contable Rápido de Stock
    const pal = Math.max(0, parseInt(modalPaletas) || 0)
    const puch = Math.max(0, parseInt(modalPuchos) || 0)

    try {
      const { data, error: rpcErr } = await supabase.rpc('ajustar_inventario_paletas', {
        p_id_producto: parseInt(modalProdId),
        p_id_almacen: selectedWarehouseId,
        p_paletas: pal,
        p_puchos: puch,
        p_motivo: modalMotivo.trim() || 'Ajuste de inventario'
      })

      if (rpcErr) {
        setError(`Error registrando inventario: ${rpcErr.message}`)
      } else {
        setSuccessMsg(
          `Stock actualizado exitosamente: ${pal} paletas + ${puch} puchos (${data?.total_unidades ?? 0} unidades).`
        )
        setShowAdjustModal(false)
        setModalPaletas('0')
        setModalPuchos('0')
        await loadWarehouseInventory(selectedWarehouseId)
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.')
    } finally {
      setSavingAdjust(false)
    }
  }

  // --- AUTO-GENERACIÓN DE PREFIJO RFID (3 primeras letras por palabra) ---
  function generateWarehousePrefix(name: string): string {
    if (!name || !name.trim()) return ''
    const clean = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
    const words = clean.split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    if (words.length === 1) {
      return words[0].substring(0, 3).toUpperCase()
    }
    return words.map((w) => w.substring(0, 3).toUpperCase()).join('')
  }

  // --- CRUD DE ALMACENES ---
  function startCreateWarehouse() {
    setEditingWh(null)
    setWhNombre('')
    setWhPrefijo('')
    setWhPrefijoCustom(false)
    setWhTipo('PRINCIPAL')
    setWhCapacidad('200')
    setWhActivo(true)
    setShowWhModal(true)
  }

  function startEditWarehouse(wh: Warehouse) {
    setEditingWh(wh)
    setWhNombre(wh.nombre)
    setWhPrefijo(wh.prefijo_rfid || generateWarehousePrefix(wh.nombre))
    setWhPrefijoCustom(Boolean(wh.prefijo_rfid))
    setWhTipo(wh.tipo)
    setWhCapacidad(wh.capacidad_m3 ? String(wh.capacidad_m3) : '100')
    setWhActivo(wh.activo)
    setShowWhModal(true)
  }

  async function handleSaveWarehouse(e: FormEvent) {
    e.preventDefault()
    const cleanNombre = whNombre.trim()
    if (!cleanNombre) {
      setError('El nombre del almacén es obligatorio.')
      return
    }

    const cleanPrefijo = (whPrefijo.trim() || generateWarehousePrefix(cleanNombre)).toUpperCase()

    setSavingWh(true)
    setError(null)
    setSuccessMsg(null)

    const payload = {
      nombre: cleanNombre,
      tipo: whTipo,
      capacidad_m3: whCapacidad ? Math.max(1, Number(whCapacidad)) : null,
      activo: whActivo,
      prefijo_rfid: cleanPrefijo
    }

    try {
      if (editingWh) {
        const { error: updErr } = await supabase
          .from('almacen')
          .update(payload)
          .eq('id_almacen', editingWh.id_almacen)

        if (updErr) throw updErr

        await logCatalogChange({
          tabla: 'almacen',
          operacion: 'UPDATE',
          id_registro: editingWh.id_almacen,
          datos_anteriores: editingWh,
          datos_nuevos: payload
        })

        setSuccessMsg(`Almacén "${cleanNombre}" actualizado correctamente con prefijo [${cleanPrefijo}].`)
        await loadInitialData(editingWh.id_almacen)
      } else {
        const { data: newWh, error: insErr } = await supabase
          .from('almacen')
          .insert(payload)
          .select('id_almacen')
          .single()

        if (insErr) throw insErr

        // Inicializar secuencia correlativa del nuevo almacén
        if (newWh?.id_almacen) {
          try {
            await supabase.from('secuencia_rfid').upsert(
              { id_almacen: newWh.id_almacen, ultimo_numero: 0 },
              { onConflict: 'id_almacen' }
            )
          } catch {}
        }

        await logCatalogChange({
          tabla: 'almacen',
          operacion: 'INSERT',
          id_registro: newWh?.id_almacen ?? 0,
          datos_nuevos: payload
        })

        setSuccessMsg(`Nuevo almacén "${cleanNombre}" registrado correctamente con prefijo [${cleanPrefijo}].`)
        await loadInitialData(newWh?.id_almacen)
      }

      setShowWhModal(false)
    } catch (err: any) {
      setError(`Error guardando almacén: ${err.message}`)
    } finally {
      setSavingWh(false)
    }
  }

  async function handleToggleWarehouseActive(wh: Warehouse) {
    setError(null)
    const updatedStatus = !wh.activo

    const { error: updErr } = await supabase
      .from('almacen')
      .update({ activo: updatedStatus })
      .eq('id_almacen', wh.id_almacen)

    if (updErr) {
      setError(`Error cambiando estado: ${updErr.message}`)
      return
    }

    await logCatalogChange({
      tabla: 'almacen',
      operacion: 'UPDATE',
      id_registro: wh.id_almacen,
      datos_anteriores: { activo: wh.activo },
      datos_nuevos: { activo: updatedStatus }
    })

    setSuccessMsg(`Almacén "${wh.nombre}" ${updatedStatus ? 'activado' : 'desactivado'}.`)
    await loadInitialData(wh.id_almacen)
  }

  async function handleDeleteWarehouse(wh: Warehouse) {
    if (!window.confirm(`¿Estás seguro de eliminar el almacén "${wh.nombre}"? Si tiene existencias registradas, el sistema impedirá su eliminación para proteger los datos.`)) {
      return
    }

    setError(null)
    const { error: delErr } = await supabase
      .from('almacen')
      .delete()
      .eq('id_almacen', wh.id_almacen)

    if (delErr) {
      setError(`No se puede eliminar el almacén porque contiene registros dependientes (inventario o movimientos). Te recomendamos desactivarlo: ${delErr.message}`)
      return
    }

    await logCatalogChange({
      tabla: 'almacen',
      operacion: 'DELETE',
      id_registro: wh.id_almacen,
      datos_anteriores: wh
    })

    setSuccessMsg(`Almacén "${wh.nombre}" eliminado correctamente.`)
    await loadInitialData()
  }

  if (loading) {
    return <main className="screen-message">Cargando infraestructura de almacenes y existencias…</main>
  }

  return (
    <section className="products-page">
      {/* Encabezado Módulo 2 */}
      <div className="page-heading">
        <div>
          <button className="link-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span> Volver al panel principal
          </button>
          <div className="view-title-row">
            <h2>Inventario y Almacenes</h2>
            <span className="module-code-badge">MOD-02</span>
          </div>
          <p className="page-lead">
            Supervisión de existencias físicas por almacén, conteo en paletas completas y puchos, y administración de sedes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="button secondary"
            type="button"
            onClick={startCreateWarehouse}
          >
            + Nueva Sede / Almacén
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setModalMode('rfid')
              setModalUidTag('')
              setModalTipoPaleta('COMPLETO')
              setModalCajasPucho('1')
              setShowAdjustModal(true)
            }}
            style={{ margin: 0 }}
          >
            + Ingresar Paleta / Stock
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => selectedWarehouseId && void loadWarehouseInventory(selectedWarehouseId)}
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && <p className="error notice" style={{ margin: '14px 0' }}>{error}</p>}
      {successMsg && (
        <div
          className="notice"
          style={{
            margin: '14px 0',
            background: 'rgba(0, 180, 216, 0.12)',
            borderColor: 'rgba(0, 180, 216, 0.4)',
            color: '#38bdf8'
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* Alertas del Sistema (Puchos Consolidados, Transferencias, etc.) */}
      {systemAlerts.length > 0 && (
        <div
          style={{
            margin: '16px 0',
            padding: '16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-warning)',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span>
              <strong style={{ color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
                Alertas operativas pendientes ({systemAlerts.length})
              </strong>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              Requieren verificación en piso de almacén
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {systemAlerts.map((alt) => (
              <div
                key={alt.id_alerta}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--color-canvas)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    [{alt.tipo}] {alt.mensaje}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    Registrada el {new Date(alt.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-detail"
                  style={{
                    color: 'var(--color-brand)',
                    fontSize: '0.78rem',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                  onClick={async () => {
                    await locationService.resolveAlert(alt.id_alerta)
                    setSystemAlerts((prev) => prev.filter((a) => a.id_alerta !== alt.id_alerta))
                    setSuccessMsg('Alerta marcada como verificada.')
                  }}
                >
                  ✓ Marcar como verificada
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector Táctico de Almacenes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}
      >
        {warehouses.map((wh) => {
          const isSelected = wh.id_almacen === selectedWarehouseId
          const tipoLabel = wh.tipo ? wh.tipo.charAt(0).toUpperCase() + wh.tipo.slice(1).toLowerCase() : 'Almacén'
          return (
            <button
              key={wh.id_almacen}
              type="button"
              onClick={() => setSelectedWarehouseId(wh.id_almacen)}
              style={{
                textAlign: 'left',
                padding: '16px 18px',
                borderRadius: '8px',
                border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                background: isSelected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                boxShadow: 'none',
                opacity: wh.activo ? 1 : 0.6,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: isSelected ? 'var(--color-brand-deep)' : 'var(--color-text-secondary)',
                    textTransform: 'none'
                  }}
                >
                  {tipoLabel} {!wh.activo && '(Inactivo)'} {wh.prefijo_rfid ? `· Tag: ${wh.prefijo_rfid}` : ''}
                </span>
                <span style={{ fontSize: '1.2rem' }}>
                  {wh.tipo === 'PRINCIPAL' ? '🏢' : wh.tipo === 'TIENDA' ? '🏪' : '⚠️'}
                </span>
              </div>
              <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--color-text-primary)', margin: '6px 0 4px' }}>
                {wh.nombre}
              </strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Capacidad nominal: {wh.capacidad_m3 ?? '—'} m³
              </span>
            </button>
          )
        })}

        {/* Tarjeta de botón rápido para agregar nuevo almacén */}
        <button
          type="button"
          onClick={startCreateWarehouse}
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: '8px',
            background: 'var(--color-surface)',
            padding: '16px 18px',
            color: 'var(--color-brand)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>➕</span>
          <strong style={{ fontSize: '0.92rem' }}>Añadir nueva sede</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Crear almacén o tienda</span>
        </button>
      </div>

      {/* Tarjetas de Métricas del Almacén Seleccionado */}
      {selectedWarehouse && (
        <div
          className="panel"
          style={{
            padding: '20px 24px',
            marginBottom: '24px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Estado operativo: {selectedWarehouse.nombre}
              </h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                Consolidación de paletas completas y bultos pucho listos para conteo y escaneo RFID.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn-detail"
                type="button"
                onClick={() => startEditWarehouse(selectedWarehouse)}
                style={{ padding: '6px 12px' }}
              >
                Configurar almacén
              </button>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: summary.pctOcupado > 85 ? 'var(--color-danger)' : 'var(--color-brand)',
                  padding: '5px 12px',
                  background: summary.pctOcupado > 85 ? 'rgba(179, 64, 42, 0.1)' : 'var(--color-brand-soft)',
                  border: `1px solid ${summary.pctOcupado > 85 ? 'rgba(179, 64, 42, 0.3)' : 'var(--color-border)'}`,
                  borderRadius: '6px'
                }}
              >
                Ocupado: {summary.totalVolumenM3} m³ / {selectedWarehouse.capacidad_m3 ?? 500} m³ ({summary.pctOcupado}%)
              </span>
            </div>
          </div>

          {/* Barra de Capacidad */}
          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'var(--color-border)',
              borderRadius: '99px',
              overflow: 'hidden',
              marginBottom: '18px'
            }}
          >
            <div
              style={{
                width: `${summary.pctOcupado}%`,
                height: '100%',
                background: summary.pctOcupado > 85
                  ? 'var(--color-danger)'
                  : 'var(--color-brand)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          {/* 4 Cajas de Métricas Tácticas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
            <div className="stat-box highlight">
              <span>Paletas completas</span>
              <strong style={{ fontSize: '1.45rem' }}>{summary.totalPaletas}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {activePallets.length} física(s) con tag activo
              </span>
            </div>

            <div className="stat-box">
              <span>Paletas pucho</span>
              <strong style={{ fontSize: '1.45rem', color: 'var(--color-brand)' }}>{summary.totalPuchos}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {summary.totalCajasPuchos} caja(s) en puchos
              </span>
            </div>

            <div className="stat-box">
              <span>Total unidades</span>
              <strong style={{ fontSize: '1.45rem' }}>{summary.totalUnidades.toLocaleString()}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Inventario total disponible</span>
            </div>

            <div className="stat-box">
              <span>Artículos / SKUs</span>
              <strong style={{ fontSize: '1.45rem', color: 'var(--color-brand)' }}>{summary.itemsCount}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Con existencias activas</span>
            </div>
          </div>
        </div>
      )}

      {/* Navegación Subpestañas */}
      <nav className="module-tabs">
        <button
          className={currentTab === 'stock' ? 'active' : ''}
          type="button"
          onClick={() => setCurrentTab('stock')}
        >
          Existencias y Paletizado ({activeItems.length})
        </button>
        <button
          className={currentTab === 'paletas' ? 'active' : ''}
          type="button"
          onClick={() => {
            setFilterPalletSku('')
            setCurrentTab('paletas')
          }}
          style={{ fontWeight: currentTab === 'paletas' ? 700 : 500 }}
        >
          Paletas RFID ({activePallets.length})
        </button>
        <button
          className={currentTab === 'ubicaciones' ? 'active' : ''}
          type="button"
          onClick={() => setCurrentTab('ubicaciones')}
        >
          Racks Drive-In y Ubicaciones
        </button>
        <button
          className={currentTab === 'movimientos' ? 'active' : ''}
          type="button"
          onClick={() => setCurrentTab('movimientos')}
        >
          Historial de Movimientos ({movements.length})
        </button>
        <button
          className={currentTab === 'almacenes' ? 'active' : ''}
          type="button"
          onClick={() => setCurrentTab('almacenes')}
        >
          Administración de Almacenes ({warehouses.length})
        </button>
      </nav>

      {/* Vista 1: Tabla de Existencias */}
      {currentTab === 'stock' && (
        <div className="panel" style={{ padding: '20px' }}>
          {loadingStock ? (
            <p className="muted">Cargando inventario táctico…</p>
          ) : displayedInventory.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '36px' }}>
              <p style={{ fontSize: '1.2rem', margin: '0 0 8px' }}>📦 Sin existencias físicas en {selectedWarehouse?.nombre}</p>
              <p className="muted" style={{ margin: 0 }}>
                {zeroStockItems.length > 0
                  ? `Todas las paletas y unidades han sido trasladadas o despachadas fuera de este almacén (${zeroStockItems.length} SKUs con balance 0).`
                  : 'Aún no se ha registrado stock para este almacén. Puedes realizar un ingreso con el botón "+ Ingresar / Ajustar Stock".'}
              </p>
              {zeroStockItems.length > 0 && !showZeroStock && (
                <div style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn-detail"
                    onClick={() => setShowZeroStock(true)}
                  >
                    👁️ Ver {zeroStockItems.length} {zeroStockItems.length === 1 ? 'producto sin existencias en este almacén' : 'productos sin existencias en este almacén'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              {zeroStockItems.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                    padding: '8px 14px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
                    Mostrando <strong>{displayedInventory.length}</strong> {displayedInventory.length === 1 ? 'producto con existencias físicas' : 'productos con existencias físicas'} en {selectedWarehouse?.nombre}.
                  </span>
                  <label
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--color-text-primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showZeroStock}
                      onChange={(e) => setShowZeroStock(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Mostrar productos agotados / sin existencias ({zeroStockItems.length})</span>
                  </label>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>SKU / Producto</th>
                    <th>Categoría</th>
                    <th>Paletas Completas</th>
                    <th>Puchos (Cajas)</th>
                    <th>Stock Total Unidades</th>
                    <th>Volumen Estimado</th>
                    <th>Semáforo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedInventory.map((item) => {
                    const stock = Number(item.stock_real) || 0
                    const r = Array.isArray(item.producto?.regla_empaque)
                      ? item.producto.regla_empaque[0]
                      : item.producto?.regla_empaque

                    const uCaja = Math.max(1, r?.unidades_por_caja || 1)
                    const cCamada = Math.max(1, r?.cajas_por_camada || r?.cajas_por_camita || 1)
                    const nCamadas = Math.max(1, r?.numero_camadas || r?.camitas_por_paleta || 1)
                    const cPaleta = cCamada * nCamadas

                    const totalCajas = Math.floor(stock / uCaja)
                    const countSummary = palletCountsMap.get(item.id_producto)
                    const prodPallets = activePallets.filter((p) => p.id_producto === item.id_producto)
                    const paletasCompletas = countSummary
                      ? Number(countSummary.paletas_completas) || 0
                      : prodPallets.filter((p) => p.tipo_paleta === 'COMPLETO').length
                    const puchosCount = countSummary
                      ? Number(countSummary.puchos) || 0
                      : prodPallets.filter((p) => p.tipo_paleta === 'PUCHO').length
                    const cajasPuchos = prodPallets
                      .filter((p) => p.tipo_paleta === 'PUCHO')
                      .reduce((acc, p) => acc + (Number(p.cantidad_paquetes) || 1), 0)
                    const totalPaletasFisicas = paletasCompletas + puchosCount
                    const volM3 = r?.volumen_caja_m3 ? totalCajas * Number(r.volumen_caja_m3) : null

                    return (
                      <tr key={item.id_inventario}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="sku-badge">{item.producto?.sku}</span>
                            <strong>{item.producto?.nombre}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="category-pill">
                            {item.producto?.categoria?.nombre ?? 'General'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: '1.05rem', color: paletasCompletas > 0 ? 'var(--color-brand)' : 'inherit' }}>
                            {paletasCompletas} {paletasCompletas === 1 ? 'paleta' : 'paletas'}
                          </strong>
                          <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                            ({paletasCompletas * cPaleta} cajas)
                          </div>
                          <div style={{ fontSize: '0.72rem', marginTop: '4px', fontWeight: 600, color: paletasCompletas > 0 ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                            {paletasCompletas > 0 ? `🏷️ ${paletasCompletas} completa(s) con tag` : '0 completas activas'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: puchosCount > 0 ? 'var(--color-warning)' : 'inherit' }}>
                            {puchosCount > 0 ? `${cajasPuchos} cajas (${puchosCount} pucho)` : '0 cajas'}
                          </span>
                          <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                            ({cajasPuchos * uCaja} unid.)
                          </div>
                          {puchosCount > 1 && (
                            <div style={{ fontSize: '0.70rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '2px' }}>
                              ⚠️ {puchosCount} puchos (unificar)
                            </div>
                          )}
                        </td>
                        <td>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>
                            {stock.toLocaleString()}
                          </strong>{' '}
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            {item.producto?.unidad_medida ?? 'UNID'}
                          </span>
                        </td>
                        <td>
                          {volM3 ? `${volM3.toFixed(3)} m³` : '—'}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '99px',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              background:
                                item.estado_semaforo === 'VERDE'
                                  ? 'rgba(0, 180, 216, 0.15)'
                                  : item.estado_semaforo === 'AMARILLO'
                                  ? 'rgba(234, 179, 8, 0.18)'
                                  : 'rgba(239, 68, 68, 0.2)',
                              color:
                                item.estado_semaforo === 'VERDE'
                                  ? '#38bdf8'
                                  : item.estado_semaforo === 'AMARILLO'
                                  ? '#fbbf24'
                                  : '#f87171',
                              border: `1px solid ${
                                item.estado_semaforo === 'VERDE'
                                  ? 'rgba(0, 180, 216, 0.4)'
                                  : item.estado_semaforo === 'AMARILLO'
                                  ? 'rgba(234, 179, 8, 0.4)'
                                  : 'rgba(239, 68, 68, 0.4)'
                              }`
                            }}
                          >
                            ● {item.estado_semaforo}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn-detail"
                              type="button"
                              onClick={() => {
                                setModalProdId(String(item.id_producto))
                                setModalPaletas(String(paletasCompletas))
                                setModalPuchos(String(cajasPuchos))
                                setShowAdjustModal(true)
                              }}
                            >
                              Ajustar Stock
                            </button>
                            <button
                              className="btn-detail"
                              type="button"
                              onClick={() => {
                                setFilterPalletSku(item.producto?.sku || '')
                                setCurrentTab('paletas')
                              }}
                              style={{
                                color: totalPaletasFisicas > 0 ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                                borderColor: totalPaletasFisicas > 0 ? undefined : 'var(--color-border)'
                              }}
                              title={totalPaletasFisicas > 0 ? `Ver las ${totalPaletasFisicas} paletas físicas con tag RFID en almacén` : 'No hay paletas físicas con tag RFID para este producto'}
                            >
                              {totalPaletasFisicas > 0 ? `Ver paletas (${totalPaletasFisicas} físicas)` : 'Paletas físicas (0)'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vista de Supervisión de Paletas RFID */}
      {currentTab === 'paletas' && selectedWarehouse && (
        <PalletDecommissionSubView
          warehouseId={selectedWarehouse.id_almacen}
          warehouseName={selectedWarehouse.nombre}
          products={allProducts}
          warehouses={warehouses}
          initialFilterSku={filterPalletSku}
          onPalletDecommissioned={() => {
            void loadWarehouseInventory(selectedWarehouse.id_almacen)
          }}
        />
      )}

      {/* Vista de Racks Drive-In y Ubicaciones Físicas */}
      {currentTab === 'ubicaciones' && selectedWarehouse && (
        <RackLocationsSubView
          warehouseId={selectedWarehouse.id_almacen}
          warehouseName={selectedWarehouse.nombre}
          products={allProducts}
        />
      )}

      {/* Vista 2: Historial de Movimientos */}
      {currentTab === 'movimientos' && (
        <div className="panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '1.1rem' }}>
            Últimos Movimientos en {selectedWarehouse?.nombre}
          </h3>
          {movements.length === 0 ? (
            <p className="muted">No hay movimientos registrados en este almacén aún.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>Cantidad Afectada</th>
                    <th>Detalle / Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id_movimiento}>
                      <td style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
                        {new Date(m.fecha_hora).toLocaleString()}
                      </td>
                      <td>
                        <span className="sku-badge">{m.tipo}</span>
                      </td>
                      <td>
                        <strong>{m.producto?.sku}</strong> · {m.producto?.nombre}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {m.cantidad_afectada} unidades
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        {m.motivo ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vista 3: CRUD de Almacenes (Sedes y Espacios Logísticos) */}
      {currentTab === 'almacenes' && (
        <div className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Catálogo y Configuración de Almacenes</h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Administra las sedes físicas, puntos de venta y áreas de merma de Importaciones Shalom.
              </p>
            </div>
            <button
              className="button"
              type="button"
              onClick={startCreateWarehouse}
              style={{ margin: 0 }}
            >
              + Registrar Nuevo Almacén
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre del Almacén</th>
                  <th>Tipo de Sede</th>
                  <th>Capacidad Nominal</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((wh) => (
                  <tr key={wh.id_almacen}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{wh.id_almacen}</td>
                    <td>
                      <strong style={{ fontSize: '1rem', color: 'var(--color-text-main)' }}>{wh.nombre}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: wh.tipo === 'PRINCIPAL'
                            ? 'rgba(0, 180, 216, 0.15)'
                            : wh.tipo === 'TIENDA'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: wh.tipo === 'PRINCIPAL'
                            ? '#38bdf8'
                            : wh.tipo === 'TIENDA'
                            ? '#fbbf24'
                            : '#f87171',
                          border: `1px solid ${
                            wh.tipo === 'PRINCIPAL'
                              ? 'rgba(0, 180, 216, 0.35)'
                              : wh.tipo === 'TIENDA'
                              ? 'rgba(234, 179, 8, 0.35)'
                              : 'rgba(239, 68, 68, 0.35)'
                          }`
                        }}
                      >
                        {wh.tipo}
                      </span>
                    </td>
                    <td>{wh.capacidad_m3 ? `${wh.capacidad_m3} m³` : 'Sin límite'}</td>
                    <td>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: wh.activo ? 'rgba(47, 125, 79, 0.1)' : 'rgba(98, 121, 133, 0.1)',
                          color: wh.activo ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          border: `1px solid ${wh.activo ? 'rgba(47, 125, 79, 0.3)' : 'var(--color-border)'}`
                        }}
                      >
                        {wh.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-detail"
                          type="button"
                          onClick={() => startEditWarehouse(wh)}
                        >
                          Editar
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => void handleToggleWarehouseActive(wh)}
                          style={{ padding: '6px 10px', fontSize: '0.8rem', margin: 0 }}
                        >
                          {wh.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteWarehouse(wh)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Ingreso de Paleta RFID / Ajuste por Paletas y Puchos */}
      {showAdjustModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">OPERACIÓN DE ENTRADA / INVENTARIO</p>
                <h3>Ingreso de Stock e Identificación de Paletas</h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>
                  Sede: <strong>{selectedWarehouse?.nombre}</strong>
                </p>
              </div>
              <button
                className="modal-close-btn"
                type="button"
                onClick={() => setShowAdjustModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Pestañas de Modo: RFID vs Ajuste Contable */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setModalMode('rfid')}
                style={{
                  background: modalMode === 'rfid' ? 'var(--color-brand)' : 'transparent',
                  color: modalMode === 'rfid' ? '#FFFFFF' : 'var(--color-text-secondary)',
                  border: `1px solid ${modalMode === 'rfid' ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontWeight: modalMode === 'rfid' ? 600 : 400,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                🏷️ Ingreso de Paleta con Tag RFID (Manual Web)
              </button>
              <button
                type="button"
                onClick={() => setModalMode('manual')}
                style={{
                  background: modalMode === 'manual' ? 'var(--color-brand)' : 'transparent',
                  color: modalMode === 'manual' ? '#FFFFFF' : 'var(--color-text-secondary)',
                  border: `1px solid ${modalMode === 'manual' ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontWeight: modalMode === 'manual' ? 600 : 400,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                📊 Ajuste Masivo Contable
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment}>
              {modalMode === 'rfid' && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'var(--color-brand-soft)',
                    border: '1px solid var(--color-border)',
                    marginBottom: '16px',
                    fontSize: '0.82rem',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <strong>Entorno Web:</strong> Como este terminal web no cuenta con sensor NFC/RFID físico como el móvil,
                  debes ingresar manualmente el código alfanumérico leído del chip RFID (o pistola lectora USB).
                  La paleta quedará registrada en el inventario activo y sus unidades sumarán automáticamente al stock real y Kardex.
                </div>
              )}

              <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', fontWeight: 600, fontSize: '0.88rem' }}>
                Producto / SKU a Ingresar
                <select
                  value={modalProdId}
                  onChange={(e) => setModalProdId(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                  required
                >
                  {allProducts.map((p) => (
                    <option key={p.id_producto} value={p.id_producto}>
                      [{p.sku}] {p.nombre} — ({p.cajas_por_paleta} cajas/paleta, {p.unidades_por_caja} unid/caja)
                    </option>
                  ))}
                </select>
              </label>

              {modalMode === 'rfid' ? (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          Código de la Paleta (Tag RFID) <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedWarehouseId) return
                            const suggested = await locationService.suggestNextRfidTag(
                              selectedWarehouseId,
                              selectedWarehouse?.prefijo_rfid || undefined
                            )
                            setModalUidTag(suggested)
                          }}
                          style={{
                            padding: '3px 10px',
                            fontSize: '0.74rem',
                            borderRadius: '4px',
                            background: 'var(--color-brand-soft)',
                            color: 'var(--color-brand)',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          title="Sugerir siguiente código secuencial según el prefijo oficial de este almacén"
                        >
                          ⚡ Sugerir ({selectedWarehouse?.prefijo_rfid || 'TAG'})
                        </button>
                      </div>
                      <input
                        type="text"
                        value={modalUidTag}
                        onChange={(e) => setModalUidTag(e.target.value.toUpperCase())}
                        placeholder={`Ej. ${selectedWarehouse?.prefijo_rfid || 'IMP'}00001`}
                        required
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          padding: '10px'
                        }}
                      />
                      <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                        Formato oficial: [{selectedWarehouse?.prefijo_rfid || 'PREFIJO'}][5 dígitos]. Ingréselo manualmente o presione Sugerir.
                      </span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                    <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                      Tipo de Paleta / Carga
                      <select
                        value={modalTipoPaleta}
                        onChange={(e) => setModalTipoPaleta(e.target.value as 'COMPLETO' | 'PUCHO')}
                        style={{
                          padding: '10px',
                          borderRadius: '6px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)'
                        }}
                      >
                        <option value="COMPLETO">Paleta Completa Estándar ({modalSelectedProd?.cajas_por_paleta ?? 0} cajas)</option>
                        <option value="PUCHO">Pucho / Carga Incompleta</option>
                      </select>
                    </label>

                    {modalTipoPaleta === 'PUCHO' ? (
                      <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                        Cajas en este Pucho
                        <input
                          type="number"
                          min="1"
                          value={modalCajasPucho}
                          onChange={(e) => setModalCajasPucho(e.target.value)}
                          required
                        />
                        <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                          Cajas físicas que contiene este pucho
                        </span>
                      </label>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Estiba estándar automática:</span>
                        <strong style={{ fontSize: '1rem', color: 'var(--color-brand)' }}>
                          {modalSelectedProd?.cajas_por_paleta ?? 0} cajas ({((modalSelectedProd?.cajas_por_paleta ?? 0) * (modalSelectedProd?.unidades_por_caja ?? 1)).toLocaleString()} unid.)
                        </strong>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                    Paletas Completas
                    <input
                      type="number"
                      min="0"
                      value={modalPaletas}
                      onChange={(e) => setModalPaletas(e.target.value)}
                      required
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontSize: '1.05rem',
                        fontWeight: 600
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                      Estiba estándar ({modalSelectedProd?.cajas_por_paleta ?? 1} cajas c/u)
                    </span>
                  </label>

                  <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                    Puchos (cajas sueltas)
                    <input
                      type="number"
                      min="0"
                      value={modalPuchos}
                      onChange={(e) => setModalPuchos(e.target.value)}
                      required
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontSize: '1.05rem',
                        fontWeight: 600
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                      Cajas que no completan una paleta
                    </span>
                  </label>
                </div>
              )}

              {modalPreview && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: 'var(--color-brand-soft)',
                    border: '1px solid var(--color-border)',
                    marginBottom: '16px'
                  }}
                >
                  <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-brand-deep)' }}>
                    Cálculo logístico de conversión
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block' }}>Cajas por paleta:</span>
                      <strong>{modalPreview.cajasPorPaleta} cajas</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block' }}>Total cajas:</span>
                      <strong>{modalPreview.totalCajas} cajas</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block' }}>Total unidades:</span>
                      <strong style={{ color: 'var(--color-brand)', fontSize: '1.05rem' }}>{modalPreview.totalUnidades.toLocaleString()} unid.</strong>
                    </div>
                    {modalPreview.volumenM3 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'block' }}>Volumen:</span>
                        <strong>{modalPreview.volumenM3} m³</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <label style={{ display: 'grid', gap: '6px', marginBottom: '20px', fontWeight: 600, fontSize: '0.88rem' }}>
                Motivo del Movimiento / Ajuste
                <input
                  type="text"
                  value={modalMotivo}
                  onChange={(e) => setModalMotivo(e.target.value)}
                  placeholder="Ej. Ingreso inicial de lote, conteo físico, etc."
                  required
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                >
                  Cancelar
                </button>
                <button
                  className="button"
                  type="submit"
                  disabled={savingAdjust}
                >
                  {savingAdjust
                    ? 'Guardando en Almacén…'
                    : modalMode === 'rfid'
                    ? `Registrar Paleta e Ingresar Stock (+${modalPreview?.totalUnidades?.toLocaleString() ?? 0} unid.)`
                    : 'Confirmar e Impactar Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Formulario CRUD de Almacén */}
      {showWhModal && (
        <div className="modal-overlay" onClick={() => setShowWhModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">GESTIÓN DE INFRAESTRUCTURA</p>
                <h3>{editingWh ? `Editar Almacén: ${editingWh.nombre}` : 'Registrar Nuevo Almacén o Sede'}</h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>
                  Define las especificaciones de capacidad y propósito logístico del almacén.
                </p>
              </div>
              <button
                className="modal-close-btn"
                type="button"
                onClick={() => setShowWhModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                  Nombre del Almacén / Sede
                  <input
                    type="text"
                    value={whNombre}
                    onChange={(e) => {
                      const val = e.target.value
                      setWhNombre(val)
                      if (!whPrefijoCustom) {
                        setWhPrefijo(generateWarehousePrefix(val))
                      }
                    }}
                    placeholder="Ej. Almacén Callao, Tienda Breña, etc."
                    required
                  />
                </label>

                <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                  Código / Prefijo RFID Oficial
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={whPrefijo}
                      maxLength={10}
                      onChange={(e) => {
                        setWhPrefijoCustom(true)
                        setWhPrefijo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      }}
                      placeholder="Ej. IMP, STO, ABA, CON"
                      style={{ textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}
                      required
                    />
                    <button
                      type="button"
                      className="button secondary"
                      style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        setWhPrefijo(generateWarehousePrefix(whNombre))
                        setWhPrefijoCustom(false)
                      }}
                      title="Regenerar con las 3 primeras letras de cada palabra"
                    >
                      ⚡ Auto (3 letras)
                    </button>
                  </div>
                  <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                    Se genera automáticamente tomando las 3 primeras letras de cada palabra. Se usará para los correlativos de paletas (ej. {whPrefijo || 'ALM'}00001).
                  </span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                    Tipo de Almacén
                    <select
                      value={whTipo}
                      onChange={(e) => setWhTipo(e.target.value as any)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'var(--color-bg-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-main)'
                      }}
                      required
                    >
                      <option value="PRINCIPAL">🏢 PRINCIPAL (Hub logístico / Central)</option>
                      <option value="TIENDA">🏪 TIENDA (Punto de venta / Despacho)</option>
                      <option value="MERMA">⚠️ MERMA (Zona de descarte y averías)</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                    Capacidad Máxima (m³)
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={whCapacidad}
                      onChange={(e) => setWhCapacidad(e.target.value)}
                      placeholder="Ej. 500"
                      required
                    />
                  </label>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={whActivo}
                    onChange={(e) => setWhActivo(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-brand)' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sede operativa activa</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowWhModal(false)}
                >
                  Cancelar
                </button>
                <button
                  className="button"
                  type="submit"
                  disabled={savingWh}
                >
                  {savingWh ? 'Guardando Almacén…' : editingWh ? 'Actualizar Almacén' : 'Crear Almacén'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
