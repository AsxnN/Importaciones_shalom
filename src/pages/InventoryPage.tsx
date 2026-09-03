import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { logCatalogChange } from '../lib/audit'
import { supabase } from '../lib/supabase'

type Warehouse = {
  id_almacen: number
  nombre: string
  tipo: 'PRINCIPAL' | 'TIENDA' | 'MERMA'
  capacidad_m3: number | null
  activo: boolean
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
  const [movements, setMovements] = useState<Movement[]>([])
  const [allProducts, setAllProducts] = useState<ProductOption[]>([])
  
  const [loading, setLoading] = useState(true)
  const [loadingStock, setLoadingStock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [currentTab, setCurrentTab] = useState<'stock' | 'movimientos' | 'almacenes'>('stock')

  // Modal de Ajuste/Ingreso por Paletas y Puchos
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [modalProdId, setModalProdId] = useState<string>('')
  const [modalPaletas, setModalPaletas] = useState<string>('0')
  const [modalPuchos, setModalPuchos] = useState<string>('0')
  const [modalMotivo, setModalMotivo] = useState<string>('Ingreso / Conteo de inventario')
  const [savingAdjust, setSavingAdjust] = useState(false)

  // Modal y Estado de CRUD para Almacenes
  const [showWhModal, setShowWhModal] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [whNombre, setWhNombre] = useState('')
  const [whTipo, setWhTipo] = useState<'PRINCIPAL' | 'TIENDA' | 'MERMA'>('PRINCIPAL')
  const [whCapacidad, setWhCapacidad] = useState('100')
  const [whActivo, setWhActivo] = useState(true)
  const [savingWh, setSavingWh] = useState(false)

  // Cargar Almacenes y Productos
  async function loadInitialData(selectWhId?: number) {
    setLoading(true)
    setError(null)

    // 1. Cargar Almacenes
    const { data: whData, error: whErr } = await supabase
      .from('almacen')
      .select('id_almacen, nombre, tipo, capacidad_m3, activo')
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
      setError(`Error consultando inventario: ${invErr.message}`)
    } else {
      setInventory((data as unknown as InventoryItem[]) || [])
    }

    // Cargar movimientos de este almacén
    const { data: movData } = await supabase
      .from('movimiento')
      .select('id_movimiento, tipo, cantidad_afectada, fecha_hora, motivo, producto(sku, nombre)')
      .eq('destino_almacen', whId)
      .order('fecha_hora', { ascending: false })
      .limit(30)

    setMovements((movData as unknown as Movement[]) || [])
    setLoadingStock(false)
  }

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedWarehouseId !== null) {
      void loadWarehouseInventory(selectedWarehouseId)
    }
  }, [selectedWarehouseId])

  // Almacén actualmente seleccionado
  const selectedWarehouse = warehouses.find((w) => w.id_almacen === selectedWarehouseId)

  // Cálculos consolidados del almacén
  const summary = useMemo(() => {
    let totalUnidades = 0
    let totalPaletas = 0
    let totalPuchos = 0
    let totalVolumenM3 = 0

    inventory.forEach((item) => {
      const stock = Number(item.stock_real) || 0
      totalUnidades += stock

      const r = Array.isArray(item.producto?.regla_empaque)
        ? item.producto.regla_empaque[0]
        : item.producto?.regla_empaque

      const uCaja = Math.max(1, r?.unidades_por_caja || 1)
      const cCamada = Math.max(1, r?.cajas_por_camada || r?.cajas_por_camita || 1)
      const nCamadas = Math.max(1, r?.numero_camadas || r?.camitas_por_paleta || 1)
      const cPaleta = cCamada * nCamadas

      const totalCajas = Math.floor(stock / uCaja)
      const paletas = Math.floor(totalCajas / cPaleta)
      const puchos = totalCajas % cPaleta

      totalPaletas += paletas
      totalPuchos += puchos

      if (r?.volumen_caja_m3) {
        totalVolumenM3 += totalCajas * Number(r.volumen_caja_m3)
      }
    })

    const capacidad = selectedWarehouse?.capacidad_m3 || 500
    const pctOcupado = capacidad > 0 ? (totalVolumenM3 / capacidad) * 100 : 0

    return {
      totalUnidades,
      totalPaletas,
      totalPuchos,
      totalVolumenM3: Number(totalVolumenM3.toFixed(3)),
      pctOcupado: Math.min(100, Number(pctOcupado.toFixed(1))),
      itemsCount: inventory.length
    }
  }, [inventory, selectedWarehouse])

  // Producto seleccionado en el modal de ajuste
  const modalSelectedProd = useMemo(() => {
    return allProducts.find((p) => String(p.id_producto) === modalProdId)
  }, [allProducts, modalProdId])

  // Cálculos en tiempo real del modal de ajuste
  const modalPreview = useMemo(() => {
    if (!modalSelectedProd) return null
    const pal = Math.max(0, parseInt(modalPaletas) || 0)
    const puch = Math.max(0, parseInt(modalPuchos) || 0)
    const cPaleta = modalSelectedProd.cajas_por_paleta || 1
    const uCaja = modalSelectedProd.unidades_por_caja || 1

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
  }, [modalSelectedProd, modalPaletas, modalPuchos])

  // Guardar Ajuste / Ingreso mediante RPC transaccional
  async function handleSaveAdjustment(e: FormEvent) {
    e.preventDefault()
    if (!selectedWarehouseId || !modalProdId) return

    setSavingAdjust(true)
    setError(null)
    setSuccessMsg(null)

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

  // --- CRUD DE ALMACENES ---
  function startCreateWarehouse() {
    setEditingWh(null)
    setWhNombre('')
    setWhTipo('PRINCIPAL')
    setWhCapacidad('200')
    setWhActivo(true)
    setShowWhModal(true)
  }

  function startEditWarehouse(wh: Warehouse) {
    setEditingWh(wh)
    setWhNombre(wh.nombre)
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

    setSavingWh(true)
    setError(null)
    setSuccessMsg(null)

    const payload = {
      nombre: cleanNombre,
      tipo: whTipo,
      capacidad_m3: whCapacidad ? Math.max(1, Number(whCapacidad)) : null,
      activo: whActivo
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

        setSuccessMsg(`Almacén "${cleanNombre}" actualizado correctamente.`)
        await loadInitialData(editingWh.id_almacen)
      } else {
        const { data: newWh, error: insErr } = await supabase
          .from('almacen')
          .insert(payload)
          .select('id_almacen')
          .single()

        if (insErr) throw insErr

        await logCatalogChange({
          tabla: 'almacen',
          operacion: 'INSERT',
          id_registro: newWh?.id_almacen ?? 0,
          datos_nuevos: payload
        })

        setSuccessMsg(`Nuevo almacén "${cleanNombre}" registrado correctamente.`)
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
          <button className="link-button" type="button" onClick={onBack}>
            ← Volver al Centro de Operaciones
          </button>
          <p className="eyebrow">MÓDULO 2 · CONTROL LOGÍSTICO Y RFID</p>
          <h2>Inventario y Almacenes</h2>
          <p className="muted">
            Supervisión de existencias físicas por almacén, conteo en paletas completas y puchos, y administración completa de sedes.
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
            onClick={() => setShowAdjustModal(true)}
            style={{ margin: 0 }}
          >
            + Ingresar / Ajustar Stock
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
          return (
            <button
              key={wh.id_almacen}
              type="button"
              onClick={() => setSelectedWarehouseId(wh.id_almacen)}
              style={{
                textAlign: 'left',
                padding: '18px 20px',
                borderRadius: '12px',
                border: isSelected ? '2px solid var(--spidey-red)' : '1px solid var(--spidey-border)',
                background: isSelected
                  ? 'linear-gradient(145deg, rgba(229, 37, 33, 0.15), rgba(11, 17, 32, 0.95))'
                  : 'rgba(11, 17, 32, 0.8)',
                boxShadow: isSelected ? '0 0 20px var(--spidey-red-glow)' : 'none',
                opacity: wh.activo ? 1 : 0.6,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: isSelected ? '#ff7b7b' : 'var(--spidey-blue)',
                    textTransform: 'uppercase'
                  }}
                >
                  SEDE #{wh.id_almacen} · {wh.tipo} {!wh.activo && '(INACTIVO)'}
                </span>
                <span style={{ fontSize: '1.2rem' }}>
                  {wh.tipo === 'PRINCIPAL' ? '🏢' : wh.tipo === 'TIENDA' ? '🏪' : '⚠️'}
                </span>
              </div>
              <strong style={{ display: 'block', fontSize: '1.15rem', color: '#ffffff', margin: '8px 0 4px' }}>
                {wh.nombre}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--spidey-text-muted)' }}>
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
            border: '2px dashed var(--spidey-border)',
            borderRadius: '12px',
            background: 'rgba(10, 16, 30, 0.4)',
            padding: '18px 20px',
            color: 'var(--spidey-blue)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>➕</span>
          <strong style={{ fontSize: '0.95rem' }}>Añadir Nueva Sede</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--spidey-text-muted)' }}>Crear almacén o tienda</span>
        </button>
      </div>

      {/* Tarjetas de Métricas del Almacén Seleccionado */}
      {selectedWarehouse && (
        <div
          className="panel"
          style={{
            padding: '20px 24px',
            marginBottom: '24px',
            background: 'rgba(10, 16, 30, 0.85)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                Estado Operativo: {selectedWarehouse.nombre}
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
                ✏️ Configurar Almacén
              </button>
              <span
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: summary.pctOcupado > 85 ? '#ff5252' : 'var(--spidey-blue)',
                  padding: '6px 12px',
                  background: 'rgba(0, 180, 216, 0.1)',
                  border: '1px solid var(--spidey-border)',
                  borderRadius: '8px'
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
              height: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
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
                  ? 'linear-gradient(90deg, #ff5252, #e52521)'
                  : 'linear-gradient(90deg, var(--spidey-blue), #38bdf8)',
                boxShadow: summary.pctOcupado > 85 ? '0 0 10px #ff5252' : '0 0 10px var(--spidey-blue-glow)',
                transition: 'width 0.4s ease'
              }}
            />
          </div>

          {/* 4 Cajas de Métricas Tácticas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
            <div className="stat-box highlight">
              <span>Paletas Completas</span>
              <strong style={{ fontSize: '1.45rem' }}>{summary.totalPaletas}</strong>
              <span style={{ fontSize: '0.72rem', color: '#ff8585', marginTop: '4px' }}>Unidades en tarima estándar</span>
            </div>

            <div className="stat-box">
              <span>Cajas Pucho (Sueltas)</span>
              <strong style={{ fontSize: '1.45rem', color: 'var(--spidey-blue)' }}>{summary.totalPuchos}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-subtle)', marginTop: '4px' }}>Paquetes fuera de estiba</span>
            </div>

            <div className="stat-box">
              <span>Total Unidades</span>
              <strong style={{ fontSize: '1.45rem' }}>{summary.totalUnidades.toLocaleString()}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-subtle)', marginTop: '4px' }}>Inventario total disponible</span>
            </div>

            <div className="stat-box">
              <span>Artículos / SKUs</span>
              <strong style={{ fontSize: '1.45rem', color: '#38bdf8' }}>{summary.itemsCount}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-subtle)', marginTop: '4px' }}>Registrados en este almacén</span>
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
          Existencias y Paletizado ({inventory.length})
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
          ) : inventory.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '36px' }}>
              <p style={{ fontSize: '1.2rem', margin: '0 0 8px' }}>📦 Sin inventario en {selectedWarehouse?.nombre}</p>
              <p className="muted" style={{ margin: 0 }}>
                Aún no se ha registrado stock para esta sede. Puedes realizar un ingreso manual con el botón "+ Ingresar / Ajustar Stock".
              </p>
            </div>
          ) : (
            <div className="table-wrap">
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
                  {inventory.map((item) => {
                    const stock = Number(item.stock_real) || 0
                    const r = Array.isArray(item.producto?.regla_empaque)
                      ? item.producto.regla_empaque[0]
                      : item.producto?.regla_empaque

                    const uCaja = Math.max(1, r?.unidades_por_caja || 1)
                    const cCamada = Math.max(1, r?.cajas_por_camada || r?.cajas_por_camita || 1)
                    const nCamadas = Math.max(1, r?.numero_camadas || r?.camitas_por_paleta || 1)
                    const cPaleta = cCamada * nCamadas

                    const totalCajas = Math.floor(stock / uCaja)
                    const paletas = Math.floor(totalCajas / cPaleta)
                    const puchos = totalCajas % cPaleta
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
                          <strong style={{ fontSize: '1.05rem', color: paletas > 0 ? '#ff5252' : 'inherit' }}>
                            {paletas} paletas
                          </strong>
                          <div style={{ fontSize: '0.74rem', color: 'var(--spidey-text-subtle)' }}>
                            ({paletas * cPaleta} cajas)
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: puchos > 0 ? 'var(--spidey-blue)' : 'inherit' }}>
                            {puchos} cajas
                          </span>
                          <div style={{ fontSize: '0.74rem', color: 'var(--spidey-text-subtle)' }}>
                            ({puchos * uCaja} unid.)
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>
                            {stock.toLocaleString()}
                          </strong>{' '}
                          <span style={{ fontSize: '0.78rem', color: 'var(--spidey-text-muted)' }}>
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
                          <button
                            className="btn-detail"
                            type="button"
                            onClick={() => {
                              setModalProdId(String(item.id_producto))
                              setModalPaletas(String(paletas))
                              setModalPuchos(String(puchos))
                              setShowAdjustModal(true)
                            }}
                          >
                            Ajustar Stock
                          </button>
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
                      <td style={{ fontSize: '0.85rem', color: 'var(--spidey-text-muted)' }}>
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
                      <strong style={{ fontSize: '1rem', color: '#ffffff' }}>{wh.nombre}</strong>
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
                          borderRadius: '99px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: wh.activo ? 'rgba(0, 180, 216, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                          color: wh.activo ? '#38bdf8' : 'var(--spidey-text-muted)',
                          border: `1px solid ${wh.activo ? 'rgba(0, 180, 216, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`
                        }}
                      >
                        {wh.activo ? '● ACTIVO' : '○ INACTIVO'}
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

      {/* MODAL 1: Ingreso / Ajuste por Paletas y Puchos */}
      {showAdjustModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">OPERACIÓN DE ENTRADA / AJUSTE</p>
                <h3>Ingreso por Paletas y Puchos</h3>
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

            <form onSubmit={handleSaveAdjustment}>
              <label style={{ display: 'grid', gap: '6px', marginBottom: '16px', fontWeight: 700, fontSize: '0.88rem' }}>
                Producto / SKU a Ajustar
                <select
                  value={modalProdId}
                  onChange={(e) => setModalProdId(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(7, 11, 20, 0.9)',
                    border: '1px solid var(--spidey-border)',
                    color: '#ffffff'
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                  Paletas Completas
                  <input
                    type="number"
                    min="0"
                    value={modalPaletas}
                    onChange={(e) => setModalPaletas(e.target.value)}
                    required
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(7, 11, 20, 0.9)',
                      border: '1px solid var(--spidey-border)',
                      color: '#ffffff',
                      fontSize: '1.1rem',
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--spidey-text-muted)' }}>
                    Estiba estándar ({modalSelectedProd?.cajas_por_paleta ?? 1} cajas c/u)
                  </span>
                </label>

                <label style={{ display: 'grid', gap: '6px', fontWeight: 700, fontSize: '0.88rem' }}>
                  Puchos (Cajas Sueltas)
                  <input
                    type="number"
                    min="0"
                    value={modalPuchos}
                    onChange={(e) => setModalPuchos(e.target.value)}
                    required
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(7, 11, 20, 0.9)',
                      border: '1px solid var(--spidey-border)',
                      color: '#ffffff',
                      fontSize: '1.1rem',
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--spidey-text-muted)' }}>
                    Cajas que no completan una paleta
                  </span>
                </label>
              </div>

              {modalPreview && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'rgba(0, 180, 216, 0.08)',
                    border: '1px solid var(--spidey-border)',
                    marginBottom: '18px'
                  }}
                >
                  <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: '0.8rem', color: 'var(--spidey-blue)', textTransform: 'uppercase' }}>
                    Cálculo Logístico Atómico (Fórmulas IEEE/SRS Shalom)
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-muted)', display: 'block' }}>Cajas por Paleta:</span>
                      <strong>{modalPreview.cajasPorPaleta} cajas</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-muted)', display: 'block' }}>Total Cajas:</span>
                      <strong>{modalPreview.totalCajas} cajas</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-muted)', display: 'block' }}>Total Unidades:</span>
                      <strong style={{ color: '#ff5252', fontSize: '1.1rem' }}>{modalPreview.totalUnidades.toLocaleString()} unid.</strong>
                    </div>
                    {modalPreview.volumenM3 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--spidey-text-muted)', display: 'block' }}>Volumen:</span>
                        <strong>{modalPreview.volumenM3} m³</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <label style={{ display: 'grid', gap: '6px', marginBottom: '22px', fontWeight: 700, fontSize: '0.88rem' }}>
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
                  {savingAdjust ? 'Guardando en Almacén…' : 'Confirmar e Impactar Stock'}
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
                    onChange={(e) => setWhNombre(e.target.value)}
                    placeholder="Ej. Almacén Callao, Tienda Breña, etc."
                    required
                  />
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
                        background: 'rgba(7, 11, 20, 0.9)',
                        border: '1px solid var(--spidey-border)',
                        color: '#ffffff'
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
                    style={{ width: '18px', height: '18px', accentColor: 'var(--spidey-red)' }}
                  />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Sede Operativa Activa</span>
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
