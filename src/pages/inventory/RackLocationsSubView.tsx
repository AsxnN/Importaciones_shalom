import { useEffect, useState, useMemo } from 'react'
import { locationService } from '../../services/locationService'
import type { LocationType, PalletRecord, RackCell, WarehouseLane } from '../../types/locations'

type ProductOption = {
  id_producto: number
  sku: string
  nombre: string
  unidades_por_caja: number
  cajas_por_paleta: number
  modo_manejo?: string
  ubicacion_permitida?: 'CAMPO' | 'RACK' | 'AMBAS'
}

type Props = {
  warehouseId: number
  warehouseName: string
  products: ProductOption[]
}

export function RackLocationsSubView({ warehouseId, warehouseName, products }: Props) {
  const [lanes, setLanes] = useState<WarehouseLane[]>([])
  const [cells, setCells] = useState<RackCell[]>([])
  const [pallets, setPallets] = useState<PalletRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Modal para Configurar Carril Drive-In
  const [showLaneModal, setShowLaneModal] = useState(false)
  const [modalLaneCode, setModalLaneCode] = useState('C01')
  const [modalLaneName, setModalLaneName] = useState('Carril 01')
  const [modalLevels, setModalLevels] = useState<{ numero_nivel: number; capacidad_paletas: number }[]>([
    { numero_nivel: 1, capacidad_paletas: 5 },
    { numero_nivel: 2, capacidad_paletas: 5 },
    { numero_nivel: 3, capacidad_paletas: 4 }
  ])
  const [savingLane, setSavingLane] = useState(false)
  const [resettingLaneId, setResettingLaneId] = useState<number | null>(null)

  // Modal para Asignar Paleta a Celda / Campo
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [targetCell, setTargetCell] = useState<RackCell | null>(null)
  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('new')
  const [selectedPalletId, setSelectedPalletId] = useState<string>('')
  
  // Formulario de nueva paleta
  const [newProdId, setNewProdId] = useState<string>(products[0]?.id_producto ? String(products[0].id_producto) : '')
  const [newUidTag, setNewUidTag] = useState('')
  const [newTipo, setNewTipo] = useState<'COMPLETO' | 'PUCHO'>('COMPLETO')
  const [newPaquetes, setNewPaquetes] = useState('10')
  const [savingAssign, setSavingAssign] = useState(false)

  const [palletSearch, setPalletSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'mapa' | 'paletas'>('mapa')

  // Cargar datos al cambiar de almacén
  const loadData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [lData, cData, pData] = await Promise.all([
        locationService.getWarehouseLanes(warehouseId),
        locationService.getWarehouseCells(warehouseId),
        locationService.getWarehousePallets(warehouseId)
      ])
      setLanes(lData)
      setCells(cData)
      setPallets(pData)
    } catch (err: any) {
      setErrorMsg(`Error cargando ubicaciones: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  // Cerrar modales con tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowAssignModal(false)
        setShowLaneModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Celdas agrupadas por carril y nivel para la visualización gráfica
  const rackCells = useMemo(() => {
    return cells.filter((c) => c.tipo_ubicacion === 'RACK')
  }, [cells])

  const campoCells = useMemo(() => {
    return (
      cells.find((c) => c.tipo_ubicacion === 'CAMPO' || c.codigo_ubicacion?.includes('CAMPO')) || {
        id_celda: 9999 + warehouseId,
        id_almacen: warehouseId,
        tipo_ubicacion: 'CAMPO' as LocationType,
        id_carril: null,
        id_nivel: null,
        posicion_fondo: null,
        codigo_ubicacion: `ALM${warehouseId}-CAMPO`,
        descripcion: 'Zona de Piso / Estiba Libre para Productos Sobredimensionados',
        activo: true,
        paleta_ocupante: null
      }
    )
  }, [cells, warehouseId])

  const campoPallets = useMemo(() => {
    return pallets.filter(
      (p) =>
        p.tipo_ubicacion === 'CAMPO' ||
        p.codigo_ubicacion?.includes('CAMPO') ||
        (campoCells && Number(p.id_celda) === Number(campoCells.id_celda)) ||
        Number(p.id_celda) === 9999 + warehouseId ||
        p.notas === 'ZONA_CAMPO' ||
        p.notas?.toUpperCase().includes('CAMPO')
    )
  }, [pallets, campoCells, warehouseId])

  const unassignedPallets = useMemo(() => {
    return pallets.filter((p) => {
      if (p.tipo_ubicacion === 'CAMPO' || p.codigo_ubicacion?.includes('CAMPO')) return false
      if (campoCells && Number(p.id_celda) === Number(campoCells.id_celda)) return false
      if (Number(p.id_celda) === 9999 + warehouseId) return false
      if (p.notas === 'ZONA_CAMPO' || p.notas?.toUpperCase().includes('CAMPO')) return false
      return !p.id_celda
    })
  }, [pallets, campoCells, warehouseId])

  // Validación de compatibilidad Celda vs Tipo de Producto
  const isTargetRack = targetCell?.tipo_ubicacion === 'RACK'
  const isTargetCampo = targetCell?.tipo_ubicacion === 'CAMPO' || targetCell?.codigo_ubicacion?.includes('CAMPO')

  const currentSelectedPallet = useMemo(() => {
    return unassignedPallets.find((p) => String(p.id_etiqueta) === selectedPalletId) || null
  }, [unassignedPallets, selectedPalletId])

  const currentPalletProd = useMemo(() => {
    if (!currentSelectedPallet) return null
    return products.find((pr) => pr.id_producto === currentSelectedPallet.id_producto) || null
  }, [currentSelectedPallet, products])

  const isCurrentPalletRestrictedToCampo = useMemo(() => {
    if (!currentSelectedPallet) return false
    const modo = currentPalletProd?.modo_manejo || currentSelectedPallet.producto?.modo_manejo
    const ubic = currentPalletProd?.ubicacion_permitida || currentSelectedPallet.producto?.ubicacion_permitida || (modo === 'SERIALIZADO' ? 'CAMPO' : 'AMBAS')
    return modo === 'SERIALIZADO' && ubic === 'CAMPO'
  }, [currentSelectedPallet, currentPalletProd])

  const currentNewProd = useMemo(() => {
    return products.find((p) => String(p.id_producto) === newProdId) || null
  }, [products, newProdId])

  const isNewProdRestrictedToCampo = useMemo(() => {
    if (!currentNewProd) return false
    const modo = currentNewProd.modo_manejo
    const ubic = currentNewProd.ubicacion_permitida || (modo === 'SERIALIZADO' ? 'CAMPO' : 'AMBAS')
    return modo === 'SERIALIZADO' && ubic === 'CAMPO'
  }, [currentNewProd])

  const isAssignBlocked = Boolean(isTargetRack && (assignMode === 'existing' ? isCurrentPalletRestrictedToCampo : isNewProdRestrictedToCampo))

  // Métricas del almacén
  const metrics = useMemo(() => {
    const totalSlots = rackCells.length
    const occupiedSlots = rackCells.filter((c) => c.paleta_ocupante !== null).length
    const freeSlots = totalSlots - occupiedSlots
    const totalCampo = campoPallets.length
    return { totalSlots, occupiedSlots, freeSlots, totalCampo }
  }, [rackCells, campoPallets])

  // Paletas filtradas por búsqueda
  const filteredPallets = useMemo(() => {
    if (!palletSearch.trim()) return pallets
    const q = palletSearch.toLowerCase().trim()
    return pallets.filter((p) => {
      const sku = p.producto?.sku?.toLowerCase() || ''
      const name = p.producto?.nombre?.toLowerCase() || ''
      const tag = p.uid_tag?.toLowerCase() || ''
      const barcode = p.codigo_barras?.toLowerCase() || ''
      const ubi = p.codigo_ubicacion?.toLowerCase() || ''
      return sku.includes(q) || name.includes(q) || tag.includes(q) || barcode.includes(q) || ubi.includes(q)
    })
  }, [pallets, palletSearch])

  // Abrir modal para nuevo carril
  function handleOpenNewLane() {
    const nextNum = (lanes.length + 1).toString().padStart(2, '0')
    setModalLaneCode(`C${nextNum}`)
    setModalLaneName(`Carril ${nextNum}`)
    setModalLevels([
      { numero_nivel: 1, capacidad_paletas: 5 },
      { numero_nivel: 2, capacidad_paletas: 5 },
      { numero_nivel: 3, capacidad_paletas: 4 }
    ])
    setShowLaneModal(true)
  }

  // Abrir modal para editar carril existente
  function handleEditLane(lane: WarehouseLane) {
    setModalLaneCode(lane.codigo_carril)
    setModalLaneName(lane.nombre)
    setModalLevels(
      lane.niveles.map((n) => ({
        numero_nivel: n.numero_nivel,
        capacidad_paletas: n.capacidad_paletas
      }))
    )
    setShowLaneModal(true)
  }

  // Agregar nivel al carril
  function handleAddLevel() {
    const nextLevel = modalLevels.length + 1
    setModalLevels([...modalLevels, { numero_nivel: nextLevel, capacidad_paletas: 4 }])
  }

  // Ajustar cantidad total de niveles directamente
  function handleSetTotalLevels(count: number) {
    if (count < 1) return
    const current = [...modalLevels]
    if (count > current.length) {
      for (let i = current.length + 1; i <= count; i++) {
        current.push({ numero_nivel: i, capacidad_paletas: 4 })
      }
    } else if (count < current.length) {
      current.splice(count)
    }
    setModalLevels(current)
  }

  // Eliminar último nivel
  function handleRemoveLevel(index: number) {
    if (modalLevels.length <= 1) return
    const updated = modalLevels.filter((_, i) => i !== index).map((lvl, idx) => ({
      ...lvl,
      numero_nivel: idx + 1
    }))
    setModalLevels(updated)
  }

  // Guardar configuración de carril
  async function handleSaveLane(e: React.FormEvent) {
    e.preventDefault()
    if (!modalLaneCode.trim()) return

    setSavingLane(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      await locationService.configureLane(
        warehouseId,
        modalLaneCode,
        modalLaneName,
        modalLevels
      )
      setSuccessMsg(`Carril ${modalLaneCode} y sus celdas configuradas exitosamente.`)
      setShowLaneModal(false)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error guardando carril: ${err.message}`)
    } finally {
      setSavingLane(false)
    }
  }

  // Abrir modal de asignación para una celda
  async function handleOpenAssign(cell: RackCell) {
    setTargetCell(cell)
    const isRack = cell.tipo_ubicacion === 'RACK'

    // Filtrar paletas que sean elegibles según la regla de ubicación
    const eligiblePallets = unassignedPallets.filter((p) => {
      if (!isRack) return true // En Zona Campo todo producto es apto
      const prod = products.find((pr) => pr.id_producto === p.id_producto)
      const modo = prod?.modo_manejo || p.producto?.modo_manejo
      const ubic = prod?.ubicacion_permitida || p.producto?.ubicacion_permitida || (modo === 'SERIALIZADO' ? 'CAMPO' : 'AMBAS')
      return !(modo === 'SERIALIZADO' && ubic === 'CAMPO')
    })

    setAssignMode(unassignedPallets.length > 0 ? 'existing' : 'new')
    setSelectedPalletId(
      eligiblePallets[0]?.id_etiqueta
        ? String(eligiblePallets[0].id_etiqueta)
        : unassignedPallets[0]?.id_etiqueta
        ? String(unassignedPallets[0].id_etiqueta)
        : ''
    )

    // Preseleccionar un producto permitido si se crea nueva paleta
    if (isRack) {
      const allowedProd = products.find(
        (p) => !(p.modo_manejo === 'SERIALIZADO' && (p.ubicacion_permitida === 'CAMPO' || !p.ubicacion_permitida))
      )
      if (allowedProd) {
        setNewProdId(String(allowedProd.id_producto))
      }
    } else if (products[0]) {
      setNewProdId(String(products[0].id_producto))
    }

    try {
      const suggestedTag = await locationService.suggestNextRfidTag(warehouseId)
      setNewUidTag(suggestedTag)
    } catch {
      setNewUidTag(`TAG-${Math.floor(100000 + Math.random() * 900000)}`)
    }
    setShowAssignModal(true)
  }

  // Asignar o crear paleta
  async function handleSaveAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!targetCell) return

    if (isAssignBlocked) {
      setErrorMsg(
        'Operación no permitida: Los productos de categoría Serializado unitario configurados para Zona Campo no pueden ubicarse en celdas de rack Drive-In.'
      )
      return
    }

    setSavingAssign(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (assignMode === 'existing' && selectedPalletId) {
        await locationService.assignPalletToCell(
          parseInt(selectedPalletId),
          targetCell.id_celda,
          warehouseId
        )
        setSuccessMsg(`Paleta asignada a ${targetCell.codigo_ubicacion} exitosamente.`)
      } else {
        const prod = products.find((p) => String(p.id_producto) === newProdId)
        await locationService.createPallet({
          id_producto: parseInt(newProdId),
          id_almacen: warehouseId,
          uid_tag: (newUidTag || `TAG-${Date.now()}`).trim().toUpperCase(),
          codigo_barras: (newUidTag || `TAG-${Date.now()}`).trim().toUpperCase(),
          tipo_paleta: newTipo,
          cantidad_paquetes: parseInt(newPaquetes) || 1,
          id_celda: targetCell.id_celda,
          sku: prod?.sku,
          nombre: prod?.nombre
        })
        setSuccessMsg(`Nueva paleta creada y ubicada en ${targetCell.codigo_ubicacion}.`)
      }
      setShowAssignModal(false)
      setTargetCell(null)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error en asignación: ${err.message}`)
    } finally {
      setSavingAssign(false)
    }
  }

  // Desasignar paleta de su celda
  async function handleUnassign(palletId: number | undefined | null, codigo: string, cellId?: number | null) {
    if (!window.confirm(`¿Liberar la ubicación ${codigo}? La paleta quedará sin espacio asignado en el rack.`)) {
      return
    }
    try {
      await locationService.unassignPallet(palletId, cellId, warehouseId)
      setSuccessMsg(`Ubicación ${codigo} liberada exitosamente.`)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error al liberar: ${err.message}`)
    }
  }

  // Reiniciar / liberar todas las paletas de un carril completo
  async function handleResetLane(lane: WarehouseLane) {
    const occupiedInLane = rackCells.filter(
      (c) => c.id_carril === lane.id_carril && c.paleta_ocupante !== null
    )

    if (occupiedInLane.length === 0) {
      window.alert(`El carril "${lane.nombre}" (${lane.codigo_carril}) ya está completamente vacío. No tiene paletas asignadas.`)
      return
    }

    const confirmed = window.confirm(
      `¿Deseas reiniciar el carril "${lane.nombre}" (${lane.codigo_carril})?\n\n` +
      `Se liberarán ${occupiedInLane.length} paleta(s) de sus posiciones en este carril.\n` +
      `Las posiciones quedarán vacías y las paletas permanecerán en el almacén como paletas sin ubicar (su stock no se borrará).`
    )

    if (!confirmed) return

    setResettingLaneId(lane.id_carril)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await locationService.unassignLane(lane.id_carril, warehouseId)
      setSuccessMsg(`Se reinició el carril "${lane.nombre}" exitosamente. Se liberaron ${res.count} paletas.`)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error al reiniciar el carril: ${err.message}`)
    } finally {
      setResettingLaneId(null)
    }
  }


  return (
    <div className="tab-pane active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Alertas */}
      {errorMsg && (
        <div className="login-error-banner" role="alert" style={{ margin: 0 }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          style={{
            padding: '10px 16px',
            backgroundColor: 'var(--color-status-green-bg)',
            border: '1px solid var(--color-status-green-border)',
            borderRadius: '4px',
            color: 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Tira de Métricas de Ubicaciones */}
      <div className="inventory-metric-strip">
        <div className="metric-box">
          <span className="metric-label">Carriles Drive-In</span>
          <span className="metric-value">{lanes.length}</span>
          <span className="metric-subtext">Entradas configuradas</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Capacidad de Celdas (Racks)</span>
          <span className="metric-value">{metrics.totalSlots}</span>
          <span className="metric-subtext">Posiciones en fondo</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Celdas Ocupadas</span>
          <span className="metric-value" style={{ color: 'var(--color-brand)' }}>
            {metrics.occupiedSlots}
          </span>
          <span className="metric-subtext">
            {metrics.totalSlots > 0
              ? `${((metrics.occupiedSlots / metrics.totalSlots) * 100).toFixed(0)}% ocupación`
              : '0% ocupación'}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Celdas Libres</span>
          <span className="metric-value" style={{ color: 'var(--color-success)' }}>
            {metrics.freeSlots}
          </span>
          <span className="metric-subtext">Espacios disponibles</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Zona Campo / Piso</span>
          <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
            {metrics.totalCampo}
          </span>
          <span className="metric-subtext">Paletas sobredimensionadas</span>
        </div>
      </div>

      {/* Selector de subvista: Plano vs Listado de Paletas */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('mapa')}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: activeTab === 'mapa' ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
            backgroundColor: activeTab === 'mapa' ? 'var(--color-brand-soft)' : 'var(--color-surface)',
            color: activeTab === 'mapa' ? 'var(--color-brand)' : 'var(--color-text-primary)',
            fontWeight: activeTab === 'mapa' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
          <span>Plano de racks y zona campo</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('paletas')}
          style={{
            padding: '8px 16px',
            borderRadius: '4px',
            border: activeTab === 'paletas' ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
            backgroundColor: activeTab === 'paletas' ? 'var(--color-brand-soft)' : 'var(--color-surface)',
            color: activeTab === 'paletas' ? 'var(--color-brand)' : 'var(--color-text-primary)',
            fontWeight: activeTab === 'paletas' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>Listado de paletas activas ({pallets.length})</span>
        </button>
      </div>

      {activeTab === 'mapa' ? (
        <>
          {/* Barra de Acciones de Ubicaciones */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
                Plano de Racks Drive-In · {warehouseName}
              </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            Estantería compacta de acumulación por fila india (LIFO). Cada nivel cuenta con su propia profundidad de cola.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="action-button primary"
            onClick={handleOpenNewLane}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Configurar nuevo carril</span>
          </button>
          {campoCells && (
            <button
              type="button"
              className="action-button secondary"
              onClick={() => handleOpenAssign(campoCells)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <span>+ Paleta a Zona Campo</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Cargando estructura de racks y ubicaciones…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {lanes.length === 0 ? (
            <div className="empty-state-panel" style={{ padding: '40px', textAlign: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                No hay carriles Drive-In configurados en este almacén
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '500px', margin: '8px auto 16px' }}>
                Empieza creando el primer carril (ej. Carril 01) e indica cuántos niveles de altura tiene y cuántas paletas de profundidad entran en cada nivel.
              </p>
              <button type="button" className="action-button primary" onClick={handleOpenNewLane}>
                Crear primer carril
              </button>
            </div>
          ) : (
            /* Visualizador Gráfico de Carriles Drive-In */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
                gap: '20px',
                alignItems: 'start'
              }}
            >
            {lanes.map((lane) => {
              // Ordenar niveles de arriba a abajo (físico: Nivel 3 arriba, Nivel 1 suelo abajo)
              const sortedLevels = [...lane.niveles].sort((a, b) => b.numero_nivel - a.numero_nivel)

              const occupiedInLane = rackCells.filter(
                (c) => c.id_carril === lane.id_carril && c.paleta_ocupante !== null
              ).length

              return (
                <div
                  key={lane.id_carril}
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    overflow: 'hidden'
                  }}
                >
                  {/* Encabezado del Carril */}
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: 'var(--color-brand-soft)',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: 'var(--color-brand)',
                          fontWeight: 700
                        }}
                      >
                        Túnel de acumulación
                      </span>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: 600,
                          color: 'var(--color-brand-deep)',
                          fontFamily: 'var(--font-display)'
                        }}
                      >
                        {lane.nombre} ({lane.codigo_carril})
                      </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="action-button secondary"
                        onClick={() => handleResetLane(lane)}
                        disabled={resettingLaneId === lane.id_carril}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: occupiedInLane > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                          borderColor: 'var(--color-border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Liberar todas las paletas de este carril y vaciar sus celdas"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                        <span>{resettingLaneId === lane.id_carril ? 'Liberando…' : `Reiniciar carril (${occupiedInLane})`}</span>
                      </button>
                      <button
                        type="button"
                        className="action-button secondary"
                        onClick={() => handleEditLane(lane)}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Editar capacidad
                      </button>
                    </div>
                  </div>

                  {/* Niveles del Carril (Visualización de Elevación) */}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {sortedLevels.map((lvl) => {
                      // Buscar celdas de este nivel
                      const lvlCells = rackCells
                        .filter((c) => c.id_carril === lane.id_carril && c.id_nivel === lvl.id_nivel)
                        .sort((a, b) => (b.posicion_fondo || 0) - (a.posicion_fondo || 0)) // Fondo (P01) a la derecha, Frente a la izquierda

                      return (
                        <div
                          key={lvl.id_nivel}
                          style={{
                            backgroundColor: 'var(--color-canvas)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            padding: '10px 12px'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '8px',
                              fontSize: '13px'
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                              Nivel {lvl.numero_nivel} {lvl.numero_nivel === 1 ? '(Piso)' : ''}
                            </span>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                              Profundidad: {lvl.capacidad_paletas} paletas
                            </span>
                          </div>

                          {/* Fila India de Posiciones en Fondo */}
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              overflowX: 'auto',
                              paddingBottom: '4px'
                            }}
                          >
                            {/* Ordenamos desde Frente hasta Fondo */}
                            {[...lvlCells].reverse().map((cell) => {
                              const isOccupied = cell.paleta_ocupante !== null
                              const isFondo = cell.posicion_fondo === 1

                              return (
                                <div
                                  key={cell.id_celda}
                                  style={{
                                    flex: '1 1 0',
                                    minWidth: '95px',
                                    backgroundColor: isOccupied ? 'var(--color-surface)' : 'rgba(255, 255, 255, 0.6)',
                                    border: isOccupied
                                      ? '1px solid var(--color-brand)'
                                      : '1px dashed var(--color-border)',
                                    borderTop: isOccupied ? '3px solid var(--color-brand)' : undefined,
                                    borderRadius: '4px',
                                    padding: '8px 6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    minHeight: '85px',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          color: isOccupied ? 'var(--color-brand-deep)' : 'var(--color-text-secondary)'
                                        }}
                                      >
                                        P{cell.posicion_fondo?.toString().padStart(2, '0')}
                                      </span>
                                      {isFondo && (
                                        <span
                                          style={{
                                            fontSize: '9px',
                                            backgroundColor: 'var(--color-brand-soft)',
                                            color: 'var(--color-brand-deep)',
                                            padding: '1px 3px',
                                            borderRadius: '2px',
                                            fontWeight: 600
                                          }}
                                          title="Primera en entrar / Fondo del túnel"
                                        >
                                          FONDO
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                                      {cell.codigo_ubicacion}
                                    </span>
                                  </div>

                                  {isOccupied && cell.paleta_ocupante ? (
                                    <div style={{ marginTop: '4px' }}>
                                      <span
                                        style={{
                                          display: 'block',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          color: 'var(--color-brand)',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }}
                                        title={cell.paleta_ocupante.producto_nombre}
                                      >
                                        {cell.paleta_ocupante.producto_sku}
                                      </span>
                                      <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                                        {cell.paleta_ocupante.cantidad_paquetes} bultos
                                      </span>
                                      <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleUnassign(cell.paleta_ocupante?.id_etiqueta, cell.codigo_ubicacion, cell.id_celda)}
                                          style={{
                                            width: '100%',
                                            padding: '2px 0',
                                            fontSize: '9px',
                                            background: 'none',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '2px',
                                            color: 'var(--color-text-secondary)',
                                            cursor: 'pointer'
                                          }}
                                          title="Desocupar casilla del rack (la paleta permanece en almacén)"
                                        >
                                          Liberar celda
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAssign(cell)}
                                      style={{
                                        marginTop: '6px',
                                        width: '100%',
                                        padding: '4px 0',
                                        fontSize: '10px',
                                        backgroundColor: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '3px',
                                        color: 'var(--color-brand)',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                      }}
                                    >
                                      + Asignar
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          )}

          {/* Panel Especial: Zona de Campo / Piso Libre */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '18px 20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-warning)'
                    }}
                  />
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '17px',
                      fontWeight: 600,
                      color: 'var(--color-brand-deep)',
                      fontFamily: 'var(--font-display)'
                    }}
                  >
                    Zona de Campo / Almacenamiento Libre en Piso
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Área abierta sin restricción de casillas. Diseñada para productos sobredimensionados, maquinaria o estiba libre.
                </p>
              </div>

              {campoCells && (
                <button
                  type="button"
                  className="action-button primary"
                  onClick={() => handleOpenAssign(campoCells)}
                  style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                  + Asignar paleta a Campo
                </button>
              )}
            </div>

            {campoPallets.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  backgroundColor: 'var(--color-canvas)',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                  fontSize: '14px'
                }}
              >
                No hay paletas almacenadas actualmente en Zona Campo.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>SKU / Producto</th>
                      <th style={{ textAlign: 'left' }}>Tag RFID / Código</th>
                      <th style={{ textAlign: 'left' }}>Tipo</th>
                      <th style={{ textAlign: 'right' }}>Paquetes / Unid.</th>
                      <th style={{ textAlign: 'left' }}>Ubicación</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campoPallets.map((p) => (
                      <tr key={p.id_etiqueta}>
                        <td>
                          <strong>{p.producto?.sku || 'SKU'}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {p.producto?.nombre}
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '12px', color: 'var(--color-brand-deep)' }}>{p.uid_tag}</code>
                          {p.codigo_barras && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                              Barra: {p.codigo_barras}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge ${p.tipo_paleta === 'COMPLETO' ? 'active' : 'inactive'}`}>
                            {p.tipo_paleta === 'COMPLETO' ? 'Paleta entera' : 'Pucho suelto'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.cantidad_paquetes}</td>
                        <td>
                          <span
                            style={{
                              backgroundColor: 'rgba(188, 121, 31, 0.12)',
                              color: 'var(--color-warning)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            ZONA CAMPO
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="action-button secondary"
                              onClick={() => handleUnassign(p.id_etiqueta, 'ZONA CAMPO', p.id_celda)}
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              title="Desocupar de Zona Campo (la paleta permanece sin ubicación asignada)"
                            >
                              Liberar celda
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      ) : (
        /* VISTA 2: LISTADO Y BAJA DE PALETAS ACTIVAS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
                Control y baja de paletas activas · {warehouseName}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                Búsqueda rápida por SKU, Tag RFID o código de barras. Permite liberar ubicaciones físicas o dar de baja definitiva por consumo interno, merma o venta directa.
              </p>
            </div>
            {campoCells && (
              <button
                type="button"
                className="action-button secondary"
                onClick={() => handleOpenAssign(campoCells)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                + Enrolar nueva paleta
              </button>
            )}
          </div>

          {/* Barra de búsqueda */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'var(--color-surface)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por SKU, nombre de producto, Tag RFID, código de barras o celda..."
              value={palletSearch}
              onChange={(e) => setPalletSearch(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
            />
            {palletSearch && (
              <button
                type="button"
                onClick={() => setPalletSearch('')}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '16px' }}
                title="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>

          {/* Tabla de paletas */}
          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="products-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Tag RFID / UID</th>
                  <th style={{ textAlign: 'left' }}>Código de barras</th>
                  <th style={{ textAlign: 'left' }}>Producto</th>
                  <th style={{ textAlign: 'center' }}>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Bultos</th>
                  <th style={{ textAlign: 'left' }}>Ubicación actual</th>
                  <th style={{ textAlign: 'center', width: '200px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPallets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary)' }}>
                      No se encontraron paletas activas {palletSearch ? 'con el criterio de búsqueda especificado' : 'en este almacén'}.
                    </td>
                  </tr>
                ) : (
                  filteredPallets.map((p) => {
                    const isCampo = p.tipo_ubicacion === 'CAMPO' || p.codigo_ubicacion?.includes('CAMPO')

                    return (
                      <tr key={p.id_etiqueta}>
                        <td>
                          <code style={{ fontWeight: 600, color: 'var(--color-brand-deep)', fontSize: '13px' }}>
                            {p.uid_tag}
                          </code>
                        </td>
                        <td style={{ fontSize: '13px', color: p.codigo_barras ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                          {p.codigo_barras || '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>
                              {p.producto?.sku || 'SKU'}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {p.producto?.nombre || 'Producto'}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-badge ${p.tipo_paleta === 'COMPLETO' ? 'active' : 'inactive'}`}>
                            {p.tipo_paleta === 'COMPLETO' ? 'Paleta entera' : 'Pucho suelto'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {p.cantidad_paquetes}
                        </td>
                        <td>
                          {p.codigo_ubicacion ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: isCampo ? 'rgba(188, 121, 31, 0.12)' : 'var(--color-brand-soft)',
                                color: isCampo ? 'var(--color-warning)' : 'var(--color-brand-deep)'
                              }}
                            >
                              {p.codigo_ubicacion}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>
                              Sin celda asignada
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {p.id_celda ? (
                              <button
                                type="button"
                                className="action-button secondary"
                                onClick={() => handleUnassign(p.id_etiqueta, p.codigo_ubicacion || 'Ubicación', p.id_celda)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                title="Liberar de la celda de rack o campo"
                              >
                                Liberar celda
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                Sin celda
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: CONFIGURAR / EDITAR CARRIL DRIVE-IN */}
      {showLaneModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLaneModal(false)}
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(18, 61, 74, 0.55)'
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', width: '100%' }}
          >
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                Configuración de Carril Drive-In
              </h3>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setShowLaneModal(false)}
                aria-label="Cerrar modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveLane} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                    Código Carril
                  </label>
                  <input
                    type="text"
                    required
                    value={modalLaneCode}
                    onChange={(e) => setModalLaneCode(e.target.value.toUpperCase())}
                    placeholder="ej. C01"
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                    Nombre del Túnel
                  </label>
                  <input
                    type="text"
                    value={modalLaneName}
                    onChange={(e) => setModalLaneName(e.target.value)}
                    placeholder="ej. Carril 01 Entrada Muelle"
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                      Cantidad de pisos / niveles:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={modalLevels.length}
                      onChange={(e) => handleSetTotalLevels(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                      style={{ width: '60px', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontWeight: 700, textAlign: 'center' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLevel}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-brand)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Agregar nivel superior
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                  {modalLevels.map((lvl, idx) => (
                    <div
                      key={lvl.numero_nivel}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        backgroundColor: 'var(--color-canvas)',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      <span style={{ minWidth: '90px', fontSize: '13px', fontWeight: 600 }}>
                        Nivel {lvl.numero_nivel} {lvl.numero_nivel === 1 ? '(Piso)' : ''}:
                      </span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={lvl.capacidad_paletas}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1)
                            const updated = [...modalLevels]
                            updated[idx].capacidad_paletas = val
                            setModalLevels(updated)
                          }}
                          style={{ width: '70px', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>paletas de fondo</span>
                      </div>
                      {modalLevels.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLevel(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-danger)',
                            fontSize: '16px',
                            cursor: 'pointer'
                          }}
                          title="Eliminar este nivel"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-brand-soft)', padding: '8px 12px', borderRadius: '4px' }}>
                💡 <strong>Total a generar:</strong>{' '}
                {modalLevels.reduce((acc, curr) => acc + curr.capacidad_paletas, 0)} celdas individuales con códigos tipo{' '}
                <code>{modalLaneCode || 'C01'}-N01-P01</code>.
              </div>

              <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={() => setShowLaneModal(false)}
                  disabled={savingLane}
                >
                  Cancelar
                </button>
                <button type="submit" className="action-button primary" disabled={savingLane}>
                  {savingLane ? 'Guardando…' : 'Guardar y generar celdas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ASIGNAR / ENROLAR PALETA A CELDA O CAMPO */}
      {showAssignModal && targetCell && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAssignModal(false)}
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(18, 61, 74, 0.55)'
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '100%' }}
          >
            <div className="modal-header">
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-brand)', fontWeight: 700 }}>
                  Asignación de Ubicación Física
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                  Ubicación: {targetCell.codigo_ubicacion}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setShowAssignModal(false)}
                aria-label="Cerrar modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveAssign} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Selector de Modo */}
              {unassignedPallets.length > 0 && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className={`action-button ${assignMode === 'new' ? 'primary' : 'secondary'}`}
                    onClick={() => setAssignMode('new')}
                    style={{ flex: 1, fontSize: '13px' }}
                  >
                    Crear nueva paleta
                  </button>
                  <button
                    type="button"
                    className={`action-button ${assignMode === 'existing' ? 'primary' : 'secondary'}`}
                    onClick={() => setAssignMode('existing')}
                    style={{ flex: 1, fontSize: '13px' }}
                  >
                    Paleta sin ubicar ({unassignedPallets.length})
                  </button>
                </div>
              )}

              {assignMode === 'existing' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                    Selecciona la paleta a ubicar
                  </label>
                  <select
                    value={selectedPalletId}
                    onChange={(e) => setSelectedPalletId(e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                  >
                    {unassignedPallets.map((p) => {
                      const prod = products.find((pr) => pr.id_producto === p.id_producto)
                      const modo = prod?.modo_manejo || p.producto?.modo_manejo
                      const ubic = prod?.ubicacion_permitida || p.producto?.ubicacion_permitida || (modo === 'SERIALIZADO' ? 'CAMPO' : 'AMBAS')
                      const isRestrictedForRack = isTargetRack && modo === 'SERIALIZADO' && ubic === 'CAMPO'

                      return (
                        <option
                          key={p.id_etiqueta}
                          value={p.id_etiqueta}
                          disabled={isRestrictedForRack}
                        >
                          {p.producto?.sku} · Tag: {p.uid_tag} ({p.cantidad_paquetes} bultos)
                          {isRestrictedForRack
                            ? ' — ⛔ Exclusivo Zona Campo (Serializado)'
                            : modo === 'SERIALIZADO'
                            ? ' — (Serializado unitario)'
                            : ' — (Paletizado estándar)'}
                        </option>
                      )
                    })}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                      Producto
                    </label>
                    <select
                      value={newProdId}
                      onChange={(e) => setNewProdId(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                    >
                      {products.map((p) => {
                        const isSerial = p.modo_manejo === 'SERIALIZADO'
                        const ubic = p.ubicacion_permitida || (isSerial ? 'CAMPO' : 'AMBAS')
                        const isRestrictedForRack = isTargetRack && isSerial && ubic === 'CAMPO'

                        return (
                          <option
                            key={p.id_producto}
                            value={p.id_producto}
                            disabled={isRestrictedForRack}
                          >
                            {p.sku} — {p.nombre}
                            {isRestrictedForRack
                              ? ' [⛔ Solo Zona Campo - Maquinaria]'
                              : isSerial
                              ? ' [Serializado unitario]'
                              : ' [Paletizado estándar]'}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                      Código de la Paleta (Tag RFID) <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newUidTag}
                      onChange={(e) => setNewUidTag(e.target.value.toUpperCase())}
                      placeholder="Ej. ALMPRI00001"
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                        Tipo
                      </label>
                      <select
                        value={newTipo}
                        onChange={(e) => setNewTipo(e.target.value as any)}
                        style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                      >
                        <option value="COMPLETO">Paleta completa</option>
                        <option value="PUCHO">Caja suelta (pucho)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                        Bultos / Cajas
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newPaquetes}
                        onChange={(e) => setNewPaquetes(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Mensaje de Restricción Operativa Drive-In vs Zona Campo */}
              {isAssignBlocked && (
                <div
                  style={{
                    backgroundColor: 'rgba(179, 64, 42, 0.08)',
                    border: '1px solid var(--color-danger)',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    color: 'var(--color-danger)',
                    fontSize: '13px',
                    lineHeight: '1.45'
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '4px' }}>
                    ⛔ Restricción Operativa: Ubicación No Permitida
                  </strong>
                  <span>
                    El producto seleccionado pertenece al modo <strong>Serializado unitario</strong> (maquinaria o equipos sobredimensionados) y está restringido a <strong>Zona Campo</strong>. No puede alojarse en celdas de altura en el rack Drive-In.
                  </span>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    💡 <em>Regla de asignación:</em> Los productos de <strong>Paletizado estándar</strong> pueden alojarse tanto en celdas de rack como en Zona Campo. Las unidades serializadas exclusivas de campo solo pueden ubicarse en la <strong>Zona Campo</strong>.
                  </div>
                </div>
              )}

              {/* Mensaje de Contexto para Zona Campo */}
              {isTargetCampo && !isAssignBlocked && (
                <div
                  style={{
                    backgroundColor: 'var(--color-brand-soft)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    color: 'var(--color-brand-deep)',
                    fontSize: '12.5px'
                  }}
                >
                  📍 <strong>Zona Campo (Piso libre):</strong> Admite tanto maquinaria serializada sobredimensionada como paletas de estiba estándar.
                </div>
              )}

              <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={() => setShowAssignModal(false)}
                  disabled={savingAssign}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="action-button primary"
                  disabled={savingAssign || isAssignBlocked}
                  style={isAssignBlocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {savingAssign ? 'Asignando…' : 'Aceptar y asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
