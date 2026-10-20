import { useEffect, useState, useMemo, type FormEvent } from 'react'
import {
  receptionService,
  type WarehouseOption,
  type ProductOption,
  type SupplierOption
} from '../services/receptionService'
import type {
  ConciliationResult,
  ImportOrder,
  ReceptionReadingItem,
  ReceptionReadingLog,
  ReceptionSession
} from '../types/receptions'

interface Props {
  onBack: () => void
  onNavigateToInventory?: () => void
}

export function ReceptionsPage({ onBack, onNavigateToInventory }: Props) {
  // 1. Almacenes y estado global
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'operar' | 'historial' | 'ordenes'>('operar')

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 2. Datos maestros para recepción
  const [orders, setOrders] = useState<ImportOrder[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [history, setHistory] = useState<ReceptionSession[]>([])

  // 3. Estado de la Sesión de Recepción Activa
  const [selectedOrderId, setSelectedOrderId] = useState<string>('')
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [sessionActive, setSessionActive] = useState(false)
  const [scannedItems, setScannedItems] = useState<ReceptionReadingItem[]>([])

  // 4. Formulario de escaneo de lectura individual
  const [scanUid, setScanUid] = useState('')
  const [scanType, setScanType] = useState<'COMPLETO' | 'PUCHO'>('COMPLETO')
  const [puchoBoxes, setPuchoBoxes] = useState<number>(1)
  const [scanError, setScanError] = useState<string | null>(null)

  // 5. Estado de Conciliación
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [conciliationResult, setConciliationResult] = useState<ConciliationResult | null>(null)

  // 6. Modal de Auditoría de Lecturas de una Sesión Histórica
  const [inspectSession, setInspectSession] = useState<ReceptionSession | null>(null)
  const [sessionReadings, setSessionReadings] = useState<ReceptionReadingLog[]>([])
  const [loadingReadings, setLoadingReadings] = useState(false)

  // 7. Modal de Nueva Orden Rápida de Importación
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [newOrderNumber, setNewOrderNumber] = useState('')
  const [newOrderSupplierId, setNewOrderSupplierId] = useState<string>('')
  const [newOrderContainer, setNewOrderContainer] = useState<'20FT' | '40FT' | 'LCL'>('40FT')
  const [newOrderItems, setNewOrderItems] = useState<Array<{ id_producto: number; cantidad_pedida: number }>>([])
  const [tempAddProdId, setTempAddProdId] = useState<string>('')
  const [tempAddQty, setTempAddQty] = useState<number>(100)
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Filtro para el historial
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COMPLETA' | 'FALTANTES' | 'SOBRANTES'>('ALL')

  // Filtro para el selector de órdenes: 'ALL' muestra todas, 'PENDING' solo en tránsito/borrador
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'PENDING'>('ALL')
  const [loadingOrders, setLoadingOrders] = useState(false)

  const handleFilterOrders = async (newFilter: 'ALL' | 'PENDING') => {
    setOrderFilter(newFilter)
    setLoadingOrders(true)
    try {
      const ordList = await receptionService.getImportOrders(newFilter)
      setOrders(ordList)
    } catch (err: any) {
      setErrorMsg(`Error al filtrar órdenes: ${err.message}`)
    } finally {
      setLoadingOrders(false)
    }
  }

  // Carga inicial de datos
  const loadInitialData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [whList, ordList, prodList, supList] = await Promise.all([
        receptionService.getWarehouses(),
        receptionService.getImportOrders('ALL'),
        receptionService.getActiveProducts(),
        receptionService.getSuppliers()
      ])

      setWarehouses(whList)
      setOrders(ordList)
      setProducts(prodList)
      setSuppliers(supList)

      if (whList.length > 0 && selectedWarehouseId === null) {
        setSelectedWarehouseId(whList[0].id_almacen)
      }

      // Cargar historial
      const hist = await receptionService.getReceptionHistory(whList[0]?.id_almacen)
      setHistory(hist)
    } catch (err: any) {
      setErrorMsg(`Error inicializando datos de recepción: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recargar historial al cambiar almacén
  useEffect(() => {
    if (selectedWarehouseId) {
      void (async () => {
        const hist = await receptionService.getReceptionHistory(selectedWarehouseId)
        setHistory(hist)
      })()
    }
  }, [selectedWarehouseId])

  // Almacén actualmente seleccionado
  const selectedWarehouse = useMemo(() => {
    return warehouses.find((w) => w.id_almacen === selectedWarehouseId) || null
  }, [warehouses, selectedWarehouseId])

  // Orden seleccionada
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null
    return orders.find((o) => o.id_orden === Number(selectedOrderId)) || null
  }, [orders, selectedOrderId])

  // Productos disponibles para la orden seleccionada (o todos si no hay orden seleccionada)
  const availableOrderProducts = useMemo(() => {
    if (!selectedOrder || !selectedOrder.detalles || selectedOrder.detalles.length === 0) {
      return products
    }
    const orderProdIds = new Set(selectedOrder.detalles.map((d) => d.id_producto))
    return products.filter((p) => orderProdIds.has(p.id_producto))
  }, [selectedOrder, products])

  // Producto seleccionado y su detalle en la orden
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null
    return products.find((p) => p.id_producto === Number(selectedProductId)) || null
  }, [products, selectedProductId])

  const selectedOrderDetail = useMemo(() => {
    if (!selectedOrder || !selectedProduct) return null
    return selectedOrder.detalles?.find((d) => d.id_producto === selectedProduct.id_producto) || null
  }, [selectedOrder, selectedProduct])

  // Cálculos en tiempo real de la sesión activa
  const sessionSummary = useMemo(() => {
    if (!selectedProduct) return { totalTags: 0, paletasCompletas: 0, totalPuchos: 0, totalCajas: 0, totalUnidades: 0 }

    let paletas = 0
    let puchos = 0

    for (const item of scannedItems) {
      if (item.tipo === 'COMPLETO') {
        paletas += 1
      } else {
        puchos += item.cantidad_paquetes
      }
    }

    const cajas = paletas * selectedProduct.cajas_por_paleta + puchos
    const unidades = cajas * selectedProduct.unidades_por_caja

    return {
      totalTags: scannedItems.length,
      paletasCompletas: paletas,
      totalPuchos: puchos,
      totalCajas: cajas,
      totalUnidades: unidades
    }
  }, [scannedItems, selectedProduct])

  // Sugerir siguiente UID conforme a norma (rellenando huecos de menor a mayor)
  const handleSuggestUid = async () => {
    if (!selectedWarehouseId) return
    const prefix = selectedWarehouse?.prefijo_rfid || undefined
    const currentUids = scannedItems.map((i) => i.uid)
    const nextUid = await receptionService.suggestNextUid(selectedWarehouseId, prefix, currentUids)
    setScanUid(nextUid)
    setScanError(null)
  }

  // Iniciar Sesión de Recepción
  const handleStartSession = () => {
    if (!selectedOrderId) {
      setErrorMsg('Debe seleccionar una orden de importación.')
      return
    }
    if (!selectedProductId) {
      setErrorMsg('Debe seleccionar el producto que ingresará en la recepción.')
      return
    }
    if (!selectedWarehouseId) {
      setErrorMsg('Debe seleccionar el almacén de destino.')
      return
    }

    setErrorMsg(null)
    setSuccessMsg(null)
    setConciliationResult(null)
    setScannedItems([])
    setSessionActive(true)

    // Sugerir el primer UID automáticamente
    void handleSuggestUid()
  }

  // Cancelar o reiniciar la sesión en curso
  const handleResetSession = () => {
    if (scannedItems.length > 0) {
      if (!window.confirm('¿Desea descartar las lecturas escaneadas y reiniciar la sesión?')) {
        return
      }
    }
    setSessionActive(false)
    setScannedItems([])
    setConciliationResult(null)
    setScanUid('')
    setScanError(null)
  }

  // Registrar lectura de tag (escáner o ingreso manual)
  const handleAddReading = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    setScanError(null)

    const cleanUid = scanUid.trim().toUpperCase()
    if (!cleanUid) {
      setScanError('Ingrese o escanee un identificador UID válido.')
      return
    }

    if (!selectedProduct) {
      setScanError('No hay un producto seleccionado.')
      return
    }

    // Validar disponibilidad del tag
    const currentUids = scannedItems.map((i) => i.uid)
    const check = await receptionService.checkTagAvailability(cleanUid, currentUids, selectedProduct.id_producto)
    if (!check.valid) {
      setScanError(check.reason || 'El tag no es válido.')
      return
    }

    const item: ReceptionReadingItem = {
      uid: cleanUid,
      tipo: scanType,
      cantidad_paquetes: scanType === 'COMPLETO' ? selectedProduct.cajas_por_paleta : Math.max(1, puchoBoxes)
    }

    const updatedItems = [item, ...scannedItems]
    setScannedItems(updatedItems)
    setScanUid('')
    setPuchoBoxes(1)
    setScanType('COMPLETO')

    // Sugerir automáticamente el siguiente correlativo libre excluyendo los ya escaneados
    if (selectedWarehouseId) {
      const prefix = selectedWarehouse?.prefijo_rfid || undefined
      const allUids = updatedItems.map((i) => i.uid)
      const nextUid = await receptionService.suggestNextUid(selectedWarehouseId, prefix, allUids)
      setScanUid(nextUid)
    }
  }

  // Quitar una lectura de la lista antes de conciliar
  const handleRemoveReading = (uid: string) => {
    setScannedItems((prev) => prev.filter((item) => item.uid !== uid))
  }

  // Finalizar recepción y conciliar ciegamente
  const handleFinishAndConciliate = async () => {
    if (scannedItems.length === 0) {
      setErrorMsg('Debe registrar al menos una paleta o pucho para conciliar.')
      return
    }
    if (!selectedOrderId || !selectedProductId || !selectedWarehouseId) {
      setErrorMsg('Datos de sesión incompletos.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    try {
      const result = await receptionService.submitConciliation({
        id_orden: Number(selectedOrderId),
        id_producto: Number(selectedProductId),
        id_almacen: selectedWarehouseId,
        lecturas: scannedItems,
        offlineTransactionId: `WEB-REC-${Date.now()}`
      })

      setConciliationResult(result)
      setSessionActive(false)
      setSelectedOrderId('')
      setSelectedProductId('')
      setScannedItems([])
      setSuccessMsg('Recepción conciliada exitosamente. El inventario físico y Kardex fueron actualizados.')

      // Recargar órdenes e historial
      const [hist, ordList] = await Promise.all([
        receptionService.getReceptionHistory(selectedWarehouseId),
        receptionService.getImportOrders(orderFilter)
      ])
      setHistory(hist)
      setOrders(ordList)
    } catch (err: any) {
      setErrorMsg(`Error al conciliar recepción: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Abrir modal de inspección de lecturas de una sesión histórica
  const handleOpenInspectSession = async (session: ReceptionSession) => {
    setInspectSession(session)
    setLoadingReadings(true)
    try {
      const readings = await receptionService.getReceptionReadings(session.id_sesion)
      setSessionReadings(readings)
    } catch {
      setSessionReadings([])
    } finally {
      setLoadingReadings(false)
    }
  }

  // Agregar item temporal a la nueva orden
  const handleAddOrderItem = () => {
    if (!tempAddProdId) return
    const prodId = Number(tempAddProdId)
    if (newOrderItems.some((i) => i.id_producto === prodId)) {
      alert('Este producto ya fue agregado a la orden.')
      return
    }
    setNewOrderItems((prev) => [...prev, { id_producto: prodId, cantidad_pedida: tempAddQty }])
    setTempAddProdId('')
    setTempAddQty(100)
  }

  // Crear nueva orden de importación
  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (!newOrderNumber.trim()) {
      alert('Ingrese el número de orden.')
      return
    }
    if (newOrderItems.length === 0) {
      alert('Debe agregar al menos un producto a la orden.')
      return
    }

    setCreatingOrder(true)
    try {
      const res = await receptionService.createImportOrder({
        numero_orden: newOrderNumber.trim(),
        id_proveedor: newOrderSupplierId ? Number(newOrderSupplierId) : null,
        tipo_contenedor: newOrderContainer,
        items: newOrderItems
      })

      if (!res.success) {
        alert(res.error || 'Error al crear orden.')
        return
      }

      // Recargar órdenes
      const updatedOrders = await receptionService.getImportOrders(orderFilter)
      setOrders(updatedOrders)
      setShowOrderModal(false)
      setNewOrderNumber('')
      setNewOrderItems([])

      if (res.id_orden) {
        setSelectedOrderId(String(res.id_orden))
      }
      setSuccessMsg(`Orden ${newOrderNumber} creada y lista para recibir mercancía.`)
    } catch (err: any) {
      alert(err.message || 'Error inesperado.')
    } finally {
      setCreatingOrder(false)
    }
  }

  // Historial filtrado
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'ALL') return history
    return history.filter((s) => s.conciliacion?.estado === historyFilter)
  }, [history, historyFilter])

  if (loading) {
    return <main className="screen-message">Cargando infraestructura de recepciones y almacenes…</main>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 1. Encabezado de la página (skill_design.md) */}
      <div className="page-heading">
        <div>
          <button
            type="button"
            className="link-back"
            onClick={onBack}
            style={{ marginBottom: '6px' }}
          >
            Volver al resumen
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>Recepciones RFID</h1>
          <p className="page-lead" style={{ margin: '4px 0 0 0' }}>
            Recepción táctica de mercancía, enrolamiento de tags RFID/NFC y conciliación ciega contra órdenes de importación.
          </p>
        </div>

        {selectedWarehouse && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-brand)',
                background: 'var(--color-brand-soft)',
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)'
              }}
            >
              Destino: {selectedWarehouse.nombre} [{selectedWarehouse.prefijo_rfid || 'TAG'}]
            </span>
          </div>
        )}
      </div>

      {/* Notificaciones y Alertas */}
      {errorMsg && (
        <div
          style={{
            background: '#FDF2F0',
            color: 'var(--color-danger)',
            border: '1px solid rgba(179, 64, 42, 0.3)',
            borderRadius: '6px',
            padding: '12px 16px',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          role="alert"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--color-danger)' }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: 'var(--color-brand-soft)',
            color: 'var(--color-brand-deep)',
            border: '1px solid var(--color-brand)',
            borderRadius: '6px',
            padding: '12px 16px',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          role="status"
        >
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--color-brand-deep)' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Selector de Almacén de Destino (Botones de Sede Limpios) */}
      <section aria-label="Selección de almacén de destino">
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: '8px'
          }}
        >
          Almacén operativo de destino:
        </label>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {warehouses.map((wh) => {
            const isSelected = wh.id_almacen === selectedWarehouseId
            return (
              <button
                key={wh.id_almacen}
                type="button"
                onClick={() => {
                  if (sessionActive && wh.id_almacen !== selectedWarehouseId) {
                    if (!window.confirm('Hay una sesión de escaneo en curso. ¿Desea cambiar de almacén y reiniciar la sesión?')) {
                      return
                    }
                    setSessionActive(false)
                    setScannedItems([])
                  }
                  setSelectedWarehouseId(wh.id_almacen)
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                  background: isSelected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  color: isSelected ? 'var(--color-brand-deep)' : 'var(--color-text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{wh.nombre}</span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isSelected ? 'var(--color-brand)' : 'var(--color-text-secondary)'
                  }}
                >
                  [{wh.prefijo_rfid || 'TAG'}]
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 3. Pestañas Oficiales de Navegación (.module-tabs de skill_design.md) */}
      <nav className="module-tabs" aria-label="Pestañas de recepción">
        <button
          type="button"
          className={activeTab === 'operar' ? 'active' : ''}
          onClick={() => setActiveTab('operar')}
        >
          Nueva recepción táctica
        </button>

        <button
          type="button"
          className={activeTab === 'historial' ? 'active' : ''}
          onClick={() => setActiveTab('historial')}
        >
          Historial y conciliación ({history.length})
        </button>

        <button
          type="button"
          className={activeTab === 'ordenes' ? 'active' : ''}
          onClick={() => setActiveTab('ordenes')}
        >
          Órdenes de importación ({orders.length})
        </button>
      </nav>

      {/* 4. CONTENIDO: Pestaña 1 - Nueva Recepción Táctica */}
      {activeTab === 'operar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Banner de resultado de conciliación previa si se acaba de finalizar */}
          {conciliationResult && (
            <div
              className="panel"
              style={{
                borderLeft: `4px solid ${
                  conciliationResult.estado_conciliacion === 'COMPLETA' ? 'var(--color-success)' : 'var(--color-warning)'
                }`,
                backgroundColor:
                  conciliationResult.estado_conciliacion === 'COMPLETA' ? '#F2FAF4' : '#FDFBF7'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: 'var(--color-text-primary)' }}>
                    Resultado de conciliación ciega:{' '}
                    <span
                      style={{
                        color:
                          conciliationResult.estado_conciliacion === 'COMPLETA'
                            ? 'var(--color-success)'
                            : 'var(--color-warning)'
                      }}
                    >
                      {conciliationResult.estado_conciliacion}
                    </span>
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                    Sesión #{conciliationResult.id_sesion} procesada e ingresada en el almacén{' '}
                    <strong>{selectedWarehouse?.nombre}</strong>. Las paletas se encuentran en Zona Campo listas para ser ubicadas en racks.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {onNavigateToInventory && (
                    <button type="button" className="button secondary button-sm" onClick={onNavigateToInventory}>
                      Ver paletas en inventario
                    </button>
                  )}
                  <button
                    type="button"
                    className="button primary button-sm"
                    onClick={() => {
                      setConciliationResult(null)
                      setScannedItems([])
                      setSelectedOrderId('')
                      setSelectedProductId('')
                    }}
                  >
                    Nueva recepción
                  </button>
                </div>
              </div>

              {/* Tira de Métricas del Cruce Ciego */}
              <div className="indicator-strip" style={{ marginTop: '16px' }}>
                <div className="indicator-card">
                  <span className="indicator-label">Unidades esperadas</span>
                  <span className="indicator-value">{conciliationResult.cantidad_esperada}</span>
                  <span className="indicator-context">Según orden de compra</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Unidades recibidas</span>
                  <span className="indicator-value">{conciliationResult.cantidad_recibida}</span>
                  <span className="indicator-context">Físico escaneado</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Diferencia neta</span>
                  <span
                    className="indicator-value"
                    style={{
                      color:
                        conciliationResult.diferencia_unidades === 0
                          ? 'var(--color-success)'
                          : conciliationResult.diferencia_unidades < 0
                          ? 'var(--color-danger)'
                          : 'var(--color-brand)'
                    }}
                  >
                    {conciliationResult.diferencia_unidades > 0
                      ? `+${conciliationResult.diferencia_unidades}`
                      : conciliationResult.diferencia_unidades}
                  </span>
                  <span className="indicator-context">
                    {conciliationResult.diferencia_unidades === 0
                      ? 'Sin discrepancias'
                      : conciliationResult.diferencia_unidades < 0
                      ? 'Faltantes en muelle'
                      : 'Excedente recibido'}
                  </span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Bultos / Tags</span>
                  <span className="indicator-value">{conciliationResult.tags_procesados}</span>
                  <span className="indicator-context">
                    {conciliationResult.paletas_completas} completas, {conciliationResult.paquetes_puchos} puchos
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Paso 1: Configurar Recepción (Solo si no está en escaneo activo) */}
          {!sessionActive && !conciliationResult && (
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 className="section-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                    Paso 1: Configurar recepción y mercancía
                  </h2>
                  <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                    Seleccione la orden de importación y el producto que ingresará al almacén{' '}
                    <strong>{selectedWarehouse?.nombre}</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary button-sm"
                  onClick={() => setShowOrderModal(true)}
                >
                  Nueva orden de importación
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* Selector de Orden con Filtro */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                    <label
                      htmlFor="select-order"
                      style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}
                    >
                      Orden de importación *
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className={`button button-sm ${orderFilter === 'ALL' ? 'primary' : 'secondary'}`}
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                        onClick={() => void handleFilterOrders('ALL')}
                        disabled={loadingOrders}
                      >
                        Todas las órdenes
                      </button>
                      <button
                        type="button"
                        className={`button button-sm ${orderFilter === 'PENDING' ? 'primary' : 'secondary'}`}
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                        onClick={() => void handleFilterOrders('PENDING')}
                        disabled={loadingOrders}
                      >
                        Solo en tránsito
                      </button>
                    </div>
                  </div>

                  <select
                    id="select-order"
                    value={selectedOrderId}
                    onChange={(e) => {
                      setSelectedOrderId(e.target.value)
                      setSelectedProductId('')
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">
                      {loadingOrders
                        ? '-- Cargando órdenes… --'
                        : orders.length === 0
                        ? '-- No hay órdenes registradas --'
                        : `-- Seleccione una orden (${orders.length} disponibles) --`}
                    </option>
                    {orders.map((ord) => (
                      <option key={ord.id_orden} value={ord.id_orden}>
                        {ord.numero_orden} — {ord.proveedor?.razon_social || ord.proveedor?.nombre || 'Proveedor genérico'} [{ord.estado}] ({ord.tipo_contenedor || '40FT'})
                      </option>
                    ))}
                  </select>

                  {orders.length === 0 && !loadingOrders && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '10px 12px',
                        backgroundColor: 'var(--color-brand-soft)',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '13px',
                        color: 'var(--color-brand-deep)'
                      }}
                    >
                      <span>No hay órdenes de importación {orderFilter === 'PENDING' ? 'en tránsito' : 'registradas en el sistema'}. </span>
                      {orderFilter === 'PENDING' ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void handleFilterOrders('ALL')}
                          style={{ fontWeight: 600, textDecoration: 'underline' }}
                        >
                          Ver todas las órdenes
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setShowOrderModal(true)}
                          style={{ fontWeight: 600, textDecoration: 'underline' }}
                        >
                          Crear una orden nueva
                        </button>
                      )}
                    </div>
                  )}

                  {selectedOrder && selectedOrder.estado === 'RECIBIDA' && (
                    <p className="muted" style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '6px' }}>
                      Atención: Esta orden figura con estado RECIBIDA. Cualquier ingreso nuevo se registrará como recepción complementaria.
                    </p>
                  )}
                </div>

                {/* Selector de Producto */}
                <div>
                  <label
                    htmlFor="select-prod"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}
                  >
                    Producto a recibir *
                  </label>
                  <select
                    id="select-prod"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={!selectedOrderId}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: !selectedOrderId ? 'var(--color-canvas)' : 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">-- Seleccione el producto --</option>
                    {availableOrderProducts.map((prod) => (
                      <option key={prod.id_producto} value={prod.id_producto}>
                        {prod.sku} — {prod.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ficha Técnica de Empaque del SKU seleccionado */}
              {selectedProduct && (
                <div
                  style={{
                    backgroundColor: 'var(--color-brand-soft)',
                    padding: '14px 18px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '14px'
                  }}
                >
                  <div>
                    <span className="muted" style={{ fontSize: '12px' }}>Regla estándar de estiba</span>
                    <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                      {selectedProduct.cajas_por_paleta} cajas / paleta completa
                    </p>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: '12px' }}>Factor de empaque</span>
                    <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                      {selectedProduct.unidades_por_caja} unidades / caja
                    </p>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: '12px' }}>Capacidad de paleta</span>
                    <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                      {selectedProduct.cajas_por_paleta * selectedProduct.unidades_por_caja} unidades / paleta
                    </p>
                  </div>
                  {selectedOrderDetail && (
                    <div>
                      <span className="muted" style={{ fontSize: '12px' }}>Pactado en la orden</span>
                      <p style={{ margin: '2px 0 0 0', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                        {selectedOrderDetail.cantidad_pedida} unidades totales
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="button primary"
                  disabled={!selectedOrderId || !selectedProductId || !selectedWarehouseId}
                  onClick={handleStartSession}
                >
                  Iniciar sesión de escaneo táctico
                </button>
              </div>
            </div>
          )}

          {/* Consola de Escaneo Táctico y Conteo Ciego (Cuando la sesión está activa) */}
          {sessionActive && selectedProduct && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Barra de Estado de la Sesión */}
              <div
                className="panel"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  backgroundColor: 'var(--color-surface)',
                  borderLeft: '4px solid var(--color-brand)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="operational-status-pill">
                      <span className="status-dot" />
                      <span>Sesión activa</span>
                    </span>
                    <strong style={{ fontSize: '16px', color: 'var(--color-brand-deep)' }}>
                      {selectedProduct.sku} — {selectedProduct.nombre}
                    </strong>
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                    Orden: <strong>{selectedOrder?.numero_orden}</strong> | Almacén de ingreso:{' '}
                    <strong>{selectedWarehouse?.nombre}</strong> (Prefijo: {selectedWarehouse?.prefijo_rfid || 'IMP'})
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="button secondary button-sm" onClick={handleResetSession}>
                    Reiniciar sesión
                  </button>
                  <button
                    type="button"
                    className="button primary button-sm"
                    disabled={scannedItems.length === 0 || isSubmitting}
                    onClick={handleFinishAndConciliate}
                  >
                    {isSubmitting ? 'Conciliando…' : 'Finalizar y conciliar mercancía'}
                  </button>
                </div>
              </div>

              {/* Tira de Métricas en Tiempo Real (Ciega - Sin sesgar al operario) */}
              <div className="indicator-strip">
                <div className="indicator-card">
                  <span className="indicator-label">Tags / Bultos leídos</span>
                  <span className="indicator-value">{sessionSummary.totalTags}</span>
                  <span className="indicator-context">En la sesión actual</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Paletas completas</span>
                  <span className="indicator-value">{sessionSummary.paletasCompletas}</span>
                  <span className="indicator-context">{selectedProduct.cajas_por_paleta} cajas c/u</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Cajas pucho / parciales</span>
                  <span className="indicator-value">{sessionSummary.totalPuchos}</span>
                  <span className="indicator-context">Cajas sueltas escaneadas</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-label">Unidades totales leídas</span>
                  <span className="indicator-value">{sessionSummary.totalUnidades}</span>
                  <span className="indicator-context">
                    {sessionSummary.totalCajas} cajas × {selectedProduct.unidades_por_caja} unid
                  </span>
                </div>
              </div>

              {/* Consola de Entrada Táctica de Tags */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 className="section-title" style={{ margin: 0, fontSize: '16px', color: 'var(--color-brand-deep)' }}>
                  Consola de escaneo táctico (RFID / NFC / Código de Barras)
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                  Escanee con lector láser, sensor NFC o ingrese el tag y presione Enter. El sistema busca de menor a mayor los huecos libres disponibles con el prefijo oficial.
                </p>

                <form onSubmit={handleAddReading} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Selector de Modo: Paleta Completa vs Pucho */}
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>
                      <input
                        type="radio"
                        name="scanType"
                        value="COMPLETO"
                        checked={scanType === 'COMPLETO'}
                        onChange={() => setScanType('COMPLETO')}
                      />
                      <span>Paleta completa estándar ({selectedProduct.cajas_por_paleta} cajas)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>
                      <input
                        type="radio"
                        name="scanType"
                        value="PUCHO"
                        checked={scanType === 'PUCHO'}
                        onChange={() => setScanType('PUCHO')}
                      />
                      <span>Carga pucho (Bultos parciales)</span>
                    </label>
                  </div>

                  {/* Campos de captura */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 280px' }}>
                      <label
                        htmlFor="tag-input"
                        style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}
                      >
                        Identificador UID del Tag RFID / NFC *
                      </label>
                      <input
                        id="tag-input"
                        type="text"
                        placeholder={`Ej: ${selectedWarehouse?.prefijo_rfid || 'IMP'}00001 o escanee con lector`}
                        value={scanUid}
                        onChange={(e) => {
                          setScanUid(e.target.value)
                          setScanError(null)
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          background: 'var(--color-surface)',
                          color: 'var(--color-brand-deep)',
                          fontFamily: 'var(--font-body)',
                          fontSize: '15px',
                          fontWeight: 600
                        }}
                      />
                    </div>

                    {scanType === 'PUCHO' && (
                      <div style={{ width: '150px' }}>
                        <label
                          htmlFor="pucho-boxes"
                          style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}
                        >
                          Cajas sueltas *
                        </label>
                        <input
                          id="pucho-boxes"
                          type="number"
                          min="1"
                          max={selectedProduct.cajas_por_paleta - 1}
                          value={puchoBoxes}
                          onChange={(e) => setPuchoBoxes(Math.max(1, Number(e.target.value)))}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-body)',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="button secondary" onClick={handleSuggestUid}>
                        Sugerir correlativo
                      </button>
                      <button type="submit" className="button primary">
                        Registrar lectura
                      </button>
                    </div>
                  </div>

                  {scanError && (
                    <div
                      style={{
                        padding: '8px 12px',
                        fontSize: '13px',
                        background: '#FDF2F0',
                        color: 'var(--color-danger)',
                        borderRadius: '4px',
                        border: '1px solid rgba(179, 64, 42, 0.2)'
                      }}
                    >
                      {scanError}
                    </div>
                  )}
                </form>
              </div>

              {/* Bitácora de Lecturas de la Sesión en Vivo (.table-wrap) */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="section-title" style={{ margin: 0, fontSize: '16px', color: 'var(--color-brand-deep)' }}>
                    Bultos escaneados en esta sesión ({scannedItems.length})
                  </h3>
                  <span className="muted" style={{ fontSize: '13px' }}>
                    Quedarán registrados en la bitácora inmutable al conciliar
                  </span>
                </div>

                {scannedItems.length === 0 ? (
                  <div className="empty-attention" style={{ padding: '30px' }}>
                    <p style={{ margin: 0 }}>Aún no se han registrado lecturas en esta sesión.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '60px' }}>N°</th>
                          <th>UID Tag RFID</th>
                          <th>Tipo de carga</th>
                          <th>Cajas</th>
                          <th>Unidades</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannedItems.map((item, idx) => {
                          const nro = scannedItems.length - idx
                          const unidades = item.cantidad_paquetes * selectedProduct.unidades_por_caja
                          return (
                            <tr key={item.uid}>
                              <td style={{ fontWeight: 600 }}>#{nro}</td>
                              <td>
                                <strong style={{ color: 'var(--color-brand-deep)' }}>{item.uid}</strong>
                              </td>
                              <td>
                                {item.tipo === 'COMPLETO' ? (
                                  <span
                                    style={{
                                      background: 'var(--color-brand-soft)',
                                      color: 'var(--color-brand-deep)',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}
                                  >
                                    Paleta completa
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      background: '#FDF6EC',
                                      color: 'var(--color-warning)',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}
                                  >
                                    Pucho ({item.cantidad_paquetes} cajas)
                                  </span>
                                )}
                              </td>
                              <td>{item.cantidad_paquetes} cajas</td>
                              <td>{unidades} unid</td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="button secondary button-sm"
                                  style={{ color: 'var(--color-danger)', borderColor: 'rgba(179, 64, 42, 0.3)' }}
                                  onClick={() => handleRemoveReading(item.uid)}
                                  title="Quitar lectura"
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Botón de cierre al pie de la tabla */}
                {scannedItems.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button
                      type="button"
                      className="button primary"
                      disabled={isSubmitting}
                      onClick={handleFinishAndConciliate}
                    >
                      {isSubmitting ? 'Procesando conciliación…' : 'Finalizar recepción y conciliar mercancía'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. CONTENIDO: Pestaña 2 - Historial de Recepciones */}
      {activeTab === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filtros del historial */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`button button-sm ${historyFilter === 'ALL' ? 'primary' : 'secondary'}`}
                onClick={() => setHistoryFilter('ALL')}
              >
                Todos ({history.length})
              </button>
              <button
                type="button"
                className={`button button-sm ${historyFilter === 'COMPLETA' ? 'primary' : 'secondary'}`}
                onClick={() => setHistoryFilter('COMPLETA')}
              >
                Completas ({history.filter((h) => h.conciliacion?.estado === 'COMPLETA').length})
              </button>
              <button
                type="button"
                className={`button button-sm ${historyFilter === 'FALTANTES' ? 'primary' : 'secondary'}`}
                onClick={() => setHistoryFilter('FALTANTES')}
              >
                Con faltantes ({history.filter((h) => h.conciliacion?.estado === 'FALTANTES').length})
              </button>
              <button
                type="button"
                className={`button button-sm ${historyFilter === 'SOBRANTES' ? 'primary' : 'secondary'}`}
                onClick={() => setHistoryFilter('SOBRANTES')}
              >
                Con sobrantes ({history.filter((h) => h.conciliacion?.estado === 'SOBRANTES').length})
              </button>
            </div>

            <span className="muted" style={{ fontSize: '13px' }}>
              Mostrando {filteredHistory.length} sesiones
            </span>
          </div>

          {/* Tabla de Historial (.table-wrap) */}
          <div className="table-wrap" style={{ margin: 0 }}>
            {filteredHistory.length === 0 ? (
              <div className="empty-attention" style={{ padding: '36px' }}>
                <p style={{ margin: 0 }}>No hay sesiones de recepción registradas para este filtro.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Sesión</th>
                    <th>Fecha y hora</th>
                    <th>Almacén</th>
                    <th>Orden / Proveedor</th>
                    <th>Producto SKU</th>
                    <th>Paletas</th>
                    <th>Puchos</th>
                    <th>Veredicto</th>
                    <th>Responsable</th>
                    <th style={{ textAlign: 'center' }}>Lecturas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((sess) => {
                    const cEstado = sess.conciliacion?.estado || sess.estado
                    const isComplete = cEstado === 'COMPLETA'
                    const isMissing = cEstado === 'FALTANTES'

                    return (
                      <tr key={sess.id_sesion}>
                        <td>
                          <strong>#{sess.id_sesion}</strong>
                        </td>
                        <td>
                          {new Date(sess.fecha_inicio).toLocaleDateString()}{' '}
                          <span className="muted" style={{ fontSize: '12px' }}>
                            {new Date(sess.fecha_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td>{sess.almacen?.nombre || `Almacén ${sess.id_almacen}`}</td>
                        <td>
                          <strong>{sess.orden?.numero_orden || 'Directa'}</strong>
                          <div className="muted" style={{ fontSize: '12px' }}>
                            {sess.orden?.proveedor?.nombre || '—'}
                          </div>
                        </td>
                        <td>
                          <span className="sku-badge">{sess.producto?.sku || 'SKU'}</span>
                          <div className="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                            {sess.producto?.nombre}
                          </div>
                        </td>
                        <td>{sess.total_paletas_completas}</td>
                        <td>{sess.total_paquetes_puchos}</td>
                        <td>
                          {isComplete ? (
                            <span
                              style={{
                                background: '#EAF5ED',
                                color: 'var(--color-success)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                border: '1px solid rgba(47, 125, 79, 0.2)'
                              }}
                            >
                              Completa
                            </span>
                          ) : isMissing ? (
                            <span
                              style={{
                                background: '#FDF6EC',
                                color: 'var(--color-warning)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                border: '1px solid rgba(188, 121, 31, 0.2)'
                              }}
                            >
                              Faltantes
                            </span>
                          ) : (
                            <span
                              style={{
                                background: 'var(--color-brand-soft)',
                                color: 'var(--color-brand)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                border: '1px solid var(--color-border)'
                              }}
                            >
                              {cEstado.charAt(0).toUpperCase() + cEstado.slice(1).toLowerCase()}
                            </span>
                          )}
                        </td>
                        <td>{sess.usuario?.nombre_completo || sess.usuario?.email || 'Operario'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-detail"
                            onClick={() => handleOpenInspectSession(sess)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 6. CONTENIDO: Pestaña 3 - Órdenes de Importación */}
      {activeTab === 'ordenes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 className="section-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                Órdenes de importación y embarques
              </h2>
              <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                Control de pedidos de importación en tránsito y planificación de recepción en muelle.
              </p>
            </div>
            <button type="button" className="button primary" onClick={() => setShowOrderModal(true)}>
              Nueva orden de importación
            </button>
          </div>

          <div className="table-wrap" style={{ margin: 0 }}>
            {orders.length === 0 ? (
              <div className="empty-attention" style={{ padding: '36px' }}>
                <p style={{ margin: 0 }}>No hay órdenes de importación registradas en tránsito.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>N° Orden</th>
                    <th>Fecha de emisión</th>
                    <th>Proveedor</th>
                    <th>Contenedor</th>
                    <th>Líneas de producto</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.id_orden}>
                      <td>
                        <strong style={{ color: 'var(--color-brand-deep)' }}>{ord.numero_orden}</strong>
                      </td>
                      <td>{ord.fecha_emision}</td>
                      <td>{ord.proveedor?.nombre || ord.proveedor?.razon_social || 'Proveedor genérico'}</td>
                      <td>
                        <span
                          style={{
                            background: 'var(--color-canvas)',
                            border: '1px solid var(--color-border)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {ord.tipo_contenedor || '40FT'}
                        </span>
                      </td>
                      <td>
                        {ord.detalles && ord.detalles.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px' }}>
                            {ord.detalles.map((d) => (
                              <li key={d.id_detalle}>
                                <strong>{d.producto?.sku}</strong>: {d.cantidad_pedida} unid
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="muted">Sin detalles</span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            background:
                              ord.estado === 'RECIBIDA'
                                ? '#EAF5ED'
                                : ord.estado === 'TRANSITO'
                                ? '#FDF6EC'
                                : 'var(--color-canvas)',
                            color:
                              ord.estado === 'RECIBIDA'
                                ? 'var(--color-success)'
                                : ord.estado === 'TRANSITO'
                                ? 'var(--color-warning)'
                                : 'var(--color-text-secondary)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid var(--color-border)'
                          }}
                        >
                          {ord.estado.charAt(0).toUpperCase() + ord.estado.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="button primary button-sm"
                          onClick={() => {
                            setSelectedOrderId(String(ord.id_orden))
                            if (ord.detalles && ord.detalles.length > 0) {
                              setSelectedProductId(String(ord.detalles[0].id_producto))
                            }
                            setActiveTab('operar')
                          }}
                        >
                          Recepcionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 7. MODAL: Inspección de Lecturas de una Sesión Histórica */}
      {inspectSession && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                Auditoría de lecturas — Sesión #{inspectSession.id_sesion}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInspectSession(null)}
                aria-label="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                  backgroundColor: 'var(--color-canvas)',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Producto</span>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-brand-deep)' }}>{inspectSession.producto?.sku}</p>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Almacén</span>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-brand-deep)' }}>{inspectSession.almacen?.nombre}</p>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Orden</span>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-brand-deep)' }}>{inspectSession.orden?.numero_orden || 'Directa'}</p>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Estado</span>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                    {inspectSession.conciliacion?.estado || inspectSession.estado}
                  </p>
                </div>
              </div>

              {loadingReadings ? (
                <p className="screen-message" style={{ padding: '20px' }}>Cargando lecturas…</p>
              ) : sessionReadings.length === 0 ? (
                <p className="muted" style={{ padding: '20px', textAlign: 'center' }}>No se encontraron lecturas registradas.</p>
              ) : (
                <div className="table-wrap" style={{ maxHeight: '380px', overflowY: 'auto', margin: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>UID Tag RFID</th>
                        <th>Tipo de carga</th>
                        <th>Cajas</th>
                        <th>Unidades</th>
                        <th>Hora de escaneo</th>
                        <th>Validez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionReadings.map((r, i) => (
                        <tr key={r.id_lectura}>
                          <td>#{i + 1}</td>
                          <td>
                            <strong style={{ color: 'var(--color-brand-deep)' }}>{r.uid_tag}</strong>
                          </td>
                          <td>
                            {r.tipo_carga === 'COMPLETO' ? (
                              <span
                                style={{
                                  background: 'var(--color-brand-soft)',
                                  color: 'var(--color-brand-deep)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}
                              >
                                Paleta completa
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#FDF6EC',
                                  color: 'var(--color-warning)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}
                              >
                                Pucho
                              </span>
                            )}
                          </td>
                          <td>{r.cantidad_paquetes}</td>
                          <td>{r.cantidad_unidades}</td>
                          <td>{new Date(r.leido_en).toLocaleTimeString()}</td>
                          <td>
                            <span
                              style={{
                                color: r.valido ? 'var(--color-success)' : 'var(--color-danger)',
                                fontWeight: 600,
                                fontSize: '12px'
                              }}
                            >
                              {r.valido ? 'Válido' : 'Inválido'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setInspectSession(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Crear Nueva Orden de Importación Rápida */}
      {showOrderModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '640px', width: '90%' }}>
            <form onSubmit={handleCreateOrder}>
              <div className="modal-header">
                <h2 className="modal-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                  Nueva orden de importación
                </h2>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowOrderModal(false)}
                  aria-label="Cerrar ventana"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      htmlFor="order-num"
                      style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}
                    >
                      Número de orden *
                    </label>
                    <input
                      id="order-num"
                      type="text"
                      placeholder="Ej: ORD-2026-002"
                      value={newOrderNumber}
                      onChange={(e) => setNewOrderNumber(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="order-supplier"
                      style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}
                    >
                      Proveedor
                    </label>
                    <select
                      id="order-supplier"
                      value={newOrderSupplierId}
                      onChange={(e) => setNewOrderSupplierId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">-- Proveedor genérico --</option>
                      {suppliers.map((s) => (
                        <option key={s.id_proveedor} value={s.id_proveedor}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="order-container"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}
                  >
                    Tipo de contenedor
                  </label>
                  <select
                    id="order-container"
                    value={newOrderContainer}
                    onChange={(e) => setNewOrderContainer(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  >
                    <option value="40FT">Contenedor 40 FT High Cube</option>
                    <option value="20FT">Contenedor 20 FT Estándar</option>
                    <option value="LCL">Carga consolidada LCL</option>
                  </select>
                </div>

                {/* Agregar SKUs al pedido */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                    Productos de la orden
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px'
                      }}
                      value={tempAddProdId}
                      onChange={(e) => setTempAddProdId(e.target.value)}
                    >
                      <option value="">-- Seleccionar SKU --</option>
                      {products.map((p) => (
                        <option key={p.id_producto} value={p.id_producto}>
                          {p.sku} — {p.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      style={{
                        width: '110px',
                        padding: '8px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px'
                      }}
                      value={tempAddQty}
                      onChange={(e) => setTempAddQty(Math.max(1, Number(e.target.value)))}
                      placeholder="Cant."
                    />
                    <button
                      type="button"
                      className="button secondary"
                      onClick={handleAddOrderItem}
                      disabled={!tempAddProdId}
                    >
                      Agregar
                    </button>
                  </div>

                  {newOrderItems.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {newOrderItems.map((item) => {
                        const prod = products.find((p) => p.id_producto === item.id_producto)
                        return (
                          <div
                            key={item.id_producto}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              backgroundColor: 'var(--color-canvas)',
                              borderRadius: '6px',
                              border: '1px solid var(--color-border)',
                              fontSize: '13px'
                            }}
                          >
                            <span>
                              <strong style={{ color: 'var(--color-brand-deep)' }}>{prod?.sku}</strong> ({prod?.nombre}):{' '}
                              <strong>{item.cantidad_pedida}</strong> unidades
                            </span>
                            <button
                              type="button"
                              className="button secondary button-sm"
                              style={{ color: 'var(--color-danger)', borderColor: 'rgba(179, 64, 42, 0.3)', padding: '2px 8px' }}
                              onClick={() =>
                                setNewOrderItems((prev) => prev.filter((i) => i.id_producto !== item.id_producto))
                              }
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowOrderModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={creatingOrder || newOrderItems.length === 0}
                >
                  {creatingOrder ? 'Creando orden…' : 'Crear orden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
