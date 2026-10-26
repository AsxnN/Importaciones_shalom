import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { locationService } from '../services/locationService'
import type { PalletRecord } from '../types/locations'

interface Warehouse {
  id_almacen: number
  nombre: string
  tipo: string
  capacidad_m3: number
  activo: boolean
  prefijo_rfid?: string | null
}

interface MovementLog {
  id_movimiento: number
  tipo: string
  cantidad_afectada: number
  fecha_hora: string
  motivo: string | null
  destino_almacen: number | null
  producto: { sku: string; nombre: string } | null
  destino?: { nombre: string } | null
  etiqueta_rfid?: { uid_tag: string } | null
}

export function MovementsPage({ onBack }: { onBack: () => void }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [activePallets, setActivePallets] = useState<PalletRecord[]>([])
  const [movements, setMovements] = useState<MovementLog[]>([])

  const [loading, setLoading] = useState(true)
  const [loadingPallets, setLoadingPallets] = useState(false)
  const [currentTab, setCurrentTab] = useState<'operar' | 'paletas' | 'historial'>('operar')

  // Formulario unificado de movimiento
  const [selectedPalletId, setSelectedPalletId] = useState<string>('')
  const [destinationMode, setDestinationMode] = useState<'INTERNAL' | 'OUTSIDE'>('INTERNAL')
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('')
  const [tipoSalida, setTipoSalida] = useState<'VENTA_CLIENTE' | 'DISTRIBUCION_EXTERNA' | 'MERMA_EXTERNA' | 'DEVOLUCION_PROVEEDOR' | 'OTRO'>('VENTA_CLIENTE')
  const [destinatario, setDestinatario] = useState('')
  const [documentoRef, setDocumentoRef] = useState('')
  const [motivo, setMotivo] = useState('')
  const [dispatchUnits, setDispatchUnits] = useState<string>('')
  const [executing, setExecuting] = useState(false)

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Filtros de historial
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'INTERNAL' | 'OUTSIDE'>('ALL')
  const [searchPalletQuery, setSearchPalletQuery] = useState('')

  // Cargar almacenes
  async function loadWarehouses() {
    setLoading(true)
    setErrorMsg(null)
    const { data, error } = await supabase
      .from('almacen')
      .select('id_almacen, nombre, tipo, capacidad_m3, activo, prefijo_rfid')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      setErrorMsg(`Error cargando almacenes: ${error.message}`)
      setLoading(false)
      return
    }

    const list = (data as Warehouse[]) || []
    setWarehouses(list)
    if (list.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(list[0].id_almacen)
    }
    setLoading(false)
  }

  // Cargar paletas activas y movimientos del almacén seleccionado
  async function loadWarehouseData(whId: number) {
    setLoadingPallets(true)
    setErrorMsg(null)

    // 1. Paletas activas en este almacén
    try {
      const pList = await locationService.getWarehousePallets(whId)
      setActivePallets(pList)
    } catch {
      setActivePallets([])
    }

    // 2. Historial de movimientos
    const { data: movData, error: movErr } = await supabase
      .from('movimiento')
      .select(`
        id_movimiento,
        tipo,
        cantidad_afectada,
        fecha_hora,
        motivo,
        destino_almacen,
        producto ( sku, nombre ),
        destino:destino_almacen ( nombre ),
        etiqueta_rfid ( uid_tag )
      `)
      .order('fecha_hora', { ascending: false })
      .limit(60)

    if (!movErr && movData) {
      setMovements(movData as unknown as MovementLog[])
    }

    setLoadingPallets(false)
  }

  useEffect(() => {
    void loadWarehouses()
  }, [])

  useEffect(() => {
    if (selectedWarehouseId !== null) {
      void loadWarehouseData(selectedWarehouseId)
      setSelectedPalletId('')
      const dests = warehouses.filter((w) => w.id_almacen !== selectedWarehouseId)
      setTargetWarehouseId(dests.length > 0 ? String(dests[0].id_almacen) : '')
      setDestinatario('')
      setDocumentoRef('')
      setMotivo('')
    }
  }, [selectedWarehouseId, warehouses])

  const selectedWarehouse = warehouses.find((w) => w.id_almacen === selectedWarehouseId)
  const availableDestinations = warehouses.filter((w) => w.id_almacen !== selectedWarehouseId)

  // Paleta seleccionada en el formulario
  const currentPallet = useMemo(() => {
    if (!selectedPalletId) return null
    return activePallets.find((p) => String(p.id_etiqueta) === selectedPalletId) || null
  }, [selectedPalletId, activePallets])

  useEffect(() => {
    if (currentPallet) {
      setDispatchUnits(String(currentPallet.cantidad_actual || currentPallet.cantidad_paquetes || 1))
    } else {
      setDispatchUnits('')
    }
  }, [currentPallet])

  // Filtrado de paletas activas para la tabla
  const filteredActivePallets = useMemo(() => {
    if (!searchPalletQuery.trim()) return activePallets
    const q = searchPalletQuery.trim().toLowerCase()
    return activePallets.filter(
      (p) =>
        p.uid_tag.toLowerCase().includes(q) ||
        (p.producto?.sku && p.producto.sku.toLowerCase().includes(q)) ||
        (p.producto?.nombre && p.producto.nombre.toLowerCase().includes(q)) ||
        (p.codigo_ubicacion && p.codigo_ubicacion.toLowerCase().includes(q))
    )
  }, [activePallets, searchPalletQuery])

  // Filtrado de movimientos para la tabla de historial
  const filteredMovements = useMemo(() => {
    if (historyFilter === 'INTERNAL') {
      return movements.filter((m) => m.destino_almacen !== null)
    }
    if (historyFilter === 'OUTSIDE') {
      return movements.filter((m) => m.destino_almacen === null && m.tipo === 'DESPACHO_COMPLETO')
    }
    return movements
  }, [movements, historyFilter])

  // Ejecutar Acción de Movimiento (Transferencia vs Salida fuera de la empresa)
  async function handleExecuteMovement(e: FormEvent) {
    e.preventDefault()
    if (!selectedWarehouseId || !currentPallet) {
      setErrorMsg('Selecciona una paleta activa para realizar el movimiento.')
      return
    }

    setExecuting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (destinationMode === 'INTERNAL') {
        // --- CASO A: TRANSFERENCIA ENTRE ÁREAS INTERNAS ---
        const targetWhId = parseInt(targetWarehouseId)
        if (!targetWhId) {
          throw new Error('Selecciona el almacén o área interna de destino.')
        }

        const targetWh = warehouses.find((w) => w.id_almacen === targetWhId)
        const finalMotivo = motivo.trim() || `Transferencia a ${targetWh?.nombre || 'otra sede'}`

        const res = await locationService.transferPallet(
          currentPallet.uid_tag,
          selectedWarehouseId,
          targetWhId,
          finalMotivo
        )

        let msg = `Transferencia exitosa: Paleta [${currentPallet.uid_tag}] transferida a "${targetWh?.nombre}". `
        msg += `Nuevo código generado en destino: [${res.uid_destino}].`
        if (res.uid_pucho_restante) {
          msg += ` Se generó también pucho restante [${res.uid_pucho_restante}].`
        }
        if (res.alerta_generada) {
          msg += ' ⚠️ Se completó una paleta entera y se generó alerta de verificación física.'
        }

        setSuccessMsg(msg)
      } else {
        // --- CASO B: SALIDA DEFINITIVA FUERA DE LA EMPRESA (O PICKING PARCIAL) ---
        const totalUnits = Number(currentPallet.cantidad_actual) || Number(currentPallet.cantidad_paquetes) || 1
        const requestedUnits = Number(dispatchUnits) || totalUnits
        const units = Math.max(1, Math.min(requestedUnits, totalUnits))
        const cajas = Number(currentPallet.cantidad_paquetes) || 1

        const res = await locationService.dispatchPalletOutside({
          palletId: currentPallet.id_etiqueta,
          uidTag: currentPallet.uid_tag,
          warehouseId: selectedWarehouseId,
          productId: currentPallet.id_producto,
          units,
          cajas,
          tipoSalida,
          destinatario: destinatario.trim() || undefined,
          documento: documentoRef.trim() || undefined,
          motivo: motivo.trim() || 'Salida definitiva fuera de la empresa'
        })

        setSuccessMsg(res.mensaje)
      }

      // Limpiar formulario y recargar datos
      setSelectedPalletId('')
      setTargetWarehouseId('')
      setDestinatario('')
      setDocumentoRef('')
      setMotivo('')
      await loadWarehouseData(selectedWarehouseId)
    } catch (err: any) {
      setErrorMsg(err.message || 'Error procesando el movimiento.')
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return <main className="screen-message">Cargando infraestructura de movimientos y sedes…</main>
  }

  return (
    <div className="inventory-container" style={{ paddingBottom: '40px' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <button
            type="button"
            className="btn-back"
            onClick={onBack}
            style={{ marginBottom: '8px' }}
          >
            ← Volver al resumen
          </button>
          <h2 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--color-brand-deep)' }}>
            Movimientos y transferencias
          </h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.92rem' }}>
            Módulo táctico para transferencias entre áreas internas y salidas definitivas fuera de la empresa.
          </p>
        </div>

        {selectedWarehouse && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--color-brand)',
                background: 'var(--color-brand-soft)',
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)'
              }}
            >
              🏷️ Sede de origen: {selectedWarehouse.nombre} ({selectedWarehouse.prefijo_rfid || 'SIN PREFIJO'})
            </span>
          </div>
        )}
      </div>

      {/* Alertas y Mensajes */}
      {errorMsg && (
        <div className="error-banner" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: 'var(--color-brand-soft)',
            color: 'var(--color-brand-deep)',
            border: '1px solid var(--color-brand)',
            borderRadius: '6px',
            padding: '12px 18px',
            marginBottom: '16px',
            fontSize: '0.92rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>✅ {successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* Selector de Sede de Origen */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
          Selecciona el almacén o sede de origen:
        </label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {warehouses.map((wh) => {
            const isSelected = wh.id_almacen === selectedWarehouseId
            return (
              <button
                key={wh.id_almacen}
                type="button"
                onClick={() => setSelectedWarehouseId(wh.id_almacen)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  fontSize: '0.92rem',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                  background: isSelected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  color: isSelected ? 'var(--color-brand-deep)' : 'var(--color-text-primary)'
                }}
              >
                🏢 {wh.nombre}
                <span style={{ fontSize: '0.74rem', marginLeft: '6px', color: 'var(--color-text-secondary)' }}>
                  [{wh.prefijo_rfid || 'TAG'}]
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Navegación por Subpestañas del Módulo */}
      <nav className="module-tabs" style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className={currentTab === 'operar' ? 'active' : ''}
          onClick={() => setCurrentTab('operar')}
        >
          📦 Realizar movimiento o salida
        </button>
        <button
          type="button"
          className={currentTab === 'paletas' ? 'active' : ''}
          onClick={() => setCurrentTab('paletas')}
        >
          🏷️ Paletas disponibles en sede ({activePallets.length})
        </button>
        <button
          type="button"
          className={currentTab === 'historial' ? 'active' : ''}
          onClick={() => setCurrentTab('historial')}
        >
          📜 Historial y Kardex ({movements.length})
        </button>
      </nav>

      {/* PESTAÑA 1: FORMULARIO UNIFICADO DE MOVIMIENTO */}
      {currentTab === 'operar' && (
        <div className="panel" style={{ padding: '24px' }}>
          <form onSubmit={handleExecuteMovement}>
            <div style={{ marginBottom: '22px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', color: 'var(--color-brand-deep)' }}>
                Transferir o dar salida a una paleta
              </h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                Selecciona la paleta física a mover y define si el destino es otra área interna o una salida definitiva fuera de la empresa.
              </p>
            </div>

            {/* Paso 1: Selección de Paleta Activa */}
            <div style={{ marginBottom: '24px', background: 'var(--color-canvas)', padding: '16px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.92rem', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                1. Paleta física a mover (Almacén: {selectedWarehouse?.nombre}):
              </label>

              {activePallets.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '6px', border: '1px dashed var(--color-border)' }}>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    No hay paletas físicas activas registradas en {selectedWarehouse?.nombre}.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <select
                    className="form-control"
                    value={selectedPalletId}
                    onChange={(e) => setSelectedPalletId(e.target.value)}
                    required
                    style={{ fontSize: '0.95rem', padding: '10px' }}
                  >
                    <option value="">-- Selecciona una paleta de la lista --</option>
                    {activePallets.map((p) => {
                      const esSerial = p.producto?.modo_manejo === 'SERIALIZADO'
                      return (
                        <option key={p.id_etiqueta} value={String(p.id_etiqueta)}>
                          [{p.uid_tag}] {p.producto?.sku} — {p.producto?.nombre} (
                          {esSerial ? 'Serializado: 1 unidad' : `${p.cantidad_paquetes} cajas, ${p.cantidad_actual} unid.`}
                          ) {p.codigo_ubicacion ? `| Ubic: ${p.codigo_ubicacion}` : ''}
                        </option>
                      )
                    })}
                  </select>

                  {/* Ficha rápida de la paleta seleccionada */}
                  {currentPallet && (
                    <div
                      style={{
                        background: 'var(--color-surface)',
                        padding: '12px 16px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        fontSize: '0.86rem'
                      }}
                    >
                      <div>
                        <span className="muted" style={{ display: 'block' }}>Código Tag RFID</span>
                        <strong style={{ color: 'var(--color-brand)', fontSize: '1rem' }}>{currentPallet.uid_tag}</strong>
                      </div>
                      <div>
                        <span className="muted" style={{ display: 'block' }}>SKU / Producto</span>
                        <strong>{currentPallet.producto?.sku}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{currentPallet.producto?.nombre}</div>
                      </div>
                      <div>
                        <span className="muted" style={{ display: 'block' }}>Carga física / Modo</span>
                        <strong>
                          {currentPallet.producto?.modo_manejo === 'SERIALIZADO'
                            ? '1 unidad serializada'
                            : `${currentPallet.cantidad_paquetes} cajas`}
                        </strong>{' '}
                        ({Number(currentPallet.cantidad_actual || 0).toLocaleString()} unid.)
                        <span
                          style={{
                            fontSize: '0.75rem',
                            display: 'block',
                            color:
                              currentPallet.producto?.modo_manejo === 'SERIALIZADO'
                                ? 'var(--color-warning)'
                                : currentPallet.tipo_paleta === 'COMPLETO'
                                ? 'var(--color-brand)'
                                : 'var(--color-warning)'
                          }}
                        >
                          Modo:{' '}
                          {currentPallet.producto?.modo_manejo === 'SERIALIZADO'
                            ? 'Serializado unitario'
                            : currentPallet.tipo_paleta === 'COMPLETO'
                            ? 'Paleta completa'
                            : 'Pucho'}
                        </span>
                      </div>
                      <div>
                        <span className="muted" style={{ display: 'block' }}>Ubicación actual</span>
                        <strong>{currentPallet.codigo_ubicacion || 'Zona Campo / Piso libre'}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Paso 2: Selección del Tipo de Destino */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.92rem', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                2. ¿Hacia dónde se traslada la paleta?
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                {/* Opción 1: Almacén Interno */}
                <div
                  onClick={() => setDestinationMode('INTERNAL')}
                  style={{
                    border: destinationMode === 'INTERNAL' ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                    background: destinationMode === 'INTERNAL' ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                    padding: '16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="radio"
                      name="destinationMode"
                      checked={destinationMode === 'INTERNAL'}
                      onChange={() => setDestinationMode('INTERNAL')}
                    />
                    <strong style={{ fontSize: '1rem', color: 'var(--color-brand-deep)' }}>
                      🏢 Transferencia a otra área interna
                    </strong>
                  </div>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    Traslada la mercadería a otro almacén o tienda de la empresa. El código de origen se libera y se genera un <strong>nuevo código oficial con el prefijo de la sede destino</strong>.
                  </p>
                </div>

                {/* Opción 2: Fuera de la Empresa */}
                <div
                  onClick={() => setDestinationMode('OUTSIDE')}
                  style={{
                    border: destinationMode === 'OUTSIDE' ? '2px solid var(--color-danger)' : '1px solid var(--color-border)',
                    background: destinationMode === 'OUTSIDE' ? '#FDF3F2' : 'var(--color-surface)',
                    padding: '16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="radio"
                      name="destinationMode"
                      checked={destinationMode === 'OUTSIDE'}
                      onChange={() => setDestinationMode('OUTSIDE')}
                    />
                    <strong style={{ fontSize: '1rem', color: 'var(--color-danger)' }}>
                      🚪 Salida fuera de la empresa (Venta / Cliente)
                    </strong>
                  </div>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    Despacho definitivo al cliente, venta o merma externa. <strong>Libera el código RFID original para poder reutilizarlo y descuenta el stock, SIN generar ninguna paleta en otro almacén</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Paso 3A: Campos específicos si es Transferencia Interna */}
            {destinationMode === 'INTERNAL' && (
              <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                    Sede o almacén de destino:
                  </label>
                  <select
                    className="form-control"
                    value={targetWarehouseId}
                    onChange={(e) => setTargetWarehouseId(e.target.value)}
                    required={destinationMode === 'INTERNAL'}
                  >
                    <option value="">-- Selecciona el almacén destino --</option>
                    {availableDestinations.map((w) => (
                      <option key={w.id_almacen} value={String(w.id_almacen)}>
                        {w.nombre} (Prefijo RFID: {w.prefijo_rfid || 'SIN PREFIJO'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                    Motivo del traslado interno:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Reposición para tienda central, traslado por reordenamiento, etc."
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>

                {/* Resumen explicativo */}
                {targetWarehouseId && currentPallet && (
                  <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--color-brand-soft)', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--color-brand-deep)' }}>
                    ℹ️ <strong>Impacto del movimiento:</strong> La paleta <code>[{currentPallet.uid_tag}]</code> se cerrará en {selectedWarehouse?.nombre}. En {warehouses.find(w => String(w.id_almacen) === targetWarehouseId)?.nombre} se creará una paleta nueva con el código correlativo de esa sede. El stock contable se descontará del origen y se sumará al destino.
                  </div>
                )}
              </div>
            )}

            {/* Paso 3B: Campos específicos si es Salida Fuera de la Empresa */}
            {destinationMode === 'OUTSIDE' && (
              <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '6px', border: '1px solid #F5C6CB', background: '#FFF9F8' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                      Tipo de salida externa:
                    </label>
                    <select
                      className="form-control"
                      value={tipoSalida}
                      onChange={(e) => setTipoSalida(e.target.value as any)}
                    >
                      <option value="VENTA_CLIENTE">Venta a cliente final</option>
                      <option value="DISTRIBUCION_EXTERNA">Distribución a transportista / tercero</option>
                      <option value="MERMA_EXTERNA">Merma definitiva o desecho</option>
                      <option value="DEVOLUCION_PROVEEDOR">Devolución a proveedor</option>
                      <option value="OTRO">Otro retiro extraordinario</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                      Destinatario / Cliente:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ej. Comercializadora del Norte S.A.C."
                      value={destinatario}
                      onChange={(e) => setDestinatario(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                      Documento de referencia:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ej. Guía GR-001-4459 / Factura F01-120"
                      value={documentoRef}
                      onChange={(e) => setDocumentoRef(e.target.value)}
                    />
                  </div>
                </div>

                {/* Selector de cantidad a despachar (Picking de unidades vs Bulto entero) */}
                {currentPallet && (
                  <div className="form-group" style={{ marginBottom: '14px', background: 'var(--color-surface)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px', color: 'var(--color-brand-deep)' }}>
                      Cantidad a despachar (Picking de unidades / Bulto completo):
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        min="1"
                        max={currentPallet.cantidad_actual || 1}
                        value={dispatchUnits}
                        onChange={(e) => setDispatchUnits(e.target.value)}
                        className="form-control"
                        style={{ width: '140px', fontWeight: 700, padding: '8px 10px' }}
                        required
                      />
                      <span style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
                        de un total de <strong>{currentPallet.cantidad_actual || 0} unidades</strong> disponibles en esta carga
                      </span>
                      {Number(dispatchUnits) < Number(currentPallet.cantidad_actual) && (
                        <button
                          type="button"
                          className="btn-detail"
                          onClick={() => setDispatchUnits(String(currentPallet.cantidad_actual || 1))}
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                        >
                          Restablecer a total ({currentPallet.cantidad_actual})
                        </button>
                      )}
                    </div>

                    {Number(dispatchUnits) > 0 && Number(dispatchUnits) < Number(currentPallet.cantidad_actual) && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FFF3CD', border: '1px solid #FFEEBA', borderRadius: '4px', fontSize: '0.82rem', color: '#856404', lineHeight: 1.4 }}>
                        ⚡ <strong>Fraccionamiento / Picking parcial:</strong> Se despacharán <strong>{dispatchUnits} unidades</strong>. La etiqueta <code>[{currentPallet.uid_tag}]</code> permanecerá activa en el almacén como <strong>pucho con {Number(currentPallet.cantidad_actual) - Number(dispatchUnits)} unidades restantes</strong>.
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                    Motivo o detalle de la salida:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Pedido mayorista despachado por puerta 2"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>

                {/* Resumen explicativo de salida definitiva */}
                {currentPallet && (
                  <div style={{ padding: '12px 14px', background: '#F8D7DA', border: '1px solid #F5C6CB', borderRadius: '6px', fontSize: '0.84rem', color: '#721C24', lineHeight: 1.4 }}>
                    ⚠️ <strong>Salida definitiva fuera de la empresa:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>El código RFID <strong>[{currentPallet.uid_tag}]</strong> quedará liberado (estado <code>VACIA</code>) para poder reutilizarse con otra carga física.</li>
                      <li>Se descontarán <strong>{currentPallet.cantidad_paquetes} cajas ({Number(currentPallet.cantidad_actual || 0).toLocaleString()} unidades)</strong> de {selectedWarehouse?.nombre}.</li>
                      <li><strong>NO se generará ninguna paleta en ningún otro almacén</strong> (la mercancía sale de la empresa).</li>
                      <li>Quedará asentado el movimiento inmutable en el Kardex como <code>DESPACHO_COMPLETO</code>.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Botón de Confirmación */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={executing || !currentPallet || loadingPallets}
                style={{
                  padding: '12px 24px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  background: destinationMode === 'OUTSIDE' ? 'var(--color-danger)' : 'var(--color-brand)',
                  borderColor: destinationMode === 'OUTSIDE' ? 'var(--color-danger)' : 'var(--color-brand)'
                }}
              >
                {executing
                  ? 'Procesando movimiento…'
                  : destinationMode === 'OUTSIDE'
                  ? '🚪 Confirmar salida fuera de la empresa'
                  : '🏢 Ejecutar transferencia interalmacén'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PESTAÑA 2: LISTA DE PALETAS DISPONIBLES EN SEDE */}
      {currentTab === 'paletas' && (
        <div className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Paletas físicas activas en {selectedWarehouse?.nombre}
              </h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                Listado de paletas registradas con tag RFID listas para ser transferidas o despachadas.
              </p>
            </div>

            <input
              type="text"
              className="form-control"
              placeholder="Buscar por Tag, SKU, producto o celda…"
              value={searchPalletQuery}
              onChange={(e) => setSearchPalletQuery(e.target.value)}
              style={{ maxWidth: '320px' }}
            />
          </div>

          {loadingPallets ? (
            <p className="muted">Cargando paletas físicas…</p>
          ) : filteredActivePallets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', background: 'var(--color-surface)' }}>
              <p className="muted">No hay paletas físicas activas en este almacén con el filtro indicado.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tag RFID</th>
                    <th>SKU / Producto</th>
                    <th>Tipo</th>
                    <th>Cajas</th>
                    <th>Unidades</th>
                    <th>Ubicación</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivePallets.map((p) => (
                    <tr key={p.id_etiqueta}>
                      <td>
                        <strong style={{ color: 'var(--color-brand)', fontSize: '0.96rem' }}>{p.uid_tag}</strong>
                      </td>
                      <td>
                        <div>
                          <span className="sku-badge">{p.producto?.sku}</span>{' '}
                          <strong>{p.producto?.nombre}</strong>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: p.tipo_paleta === 'COMPLETO' ? 'var(--color-brand-soft)' : '#FEF3C7',
                            color: p.tipo_paleta === 'COMPLETO' ? 'var(--color-brand)' : 'var(--color-warning)'
                          }}
                        >
                          {p.tipo_paleta}
                        </span>
                      </td>
                      <td><strong>{p.cantidad_paquetes} cajas</strong></td>
                      <td>{Number(p.cantidad_actual || 0).toLocaleString()} unid.</td>
                      <td>
                        <span style={{ fontSize: '0.84rem', color: p.codigo_ubicacion ? 'var(--color-brand-deep)' : 'var(--color-text-secondary)' }}>
                          {p.codigo_ubicacion || 'Zona Campo / Piso'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-detail"
                          onClick={() => {
                            setSelectedPalletId(String(p.id_etiqueta))
                            setCurrentTab('operar')
                          }}
                        >
                          Mover / Despachar →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: HISTORIAL DE MOVIMIENTOS Y SALIDAS */}
      {currentTab === 'historial' && (
        <div className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Historial de movimientos, transferencias y salidas
              </h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                Registro inmutable de trazabilidad de paletas en Kardex.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn-detail ${historyFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('ALL')}
                style={{ fontWeight: historyFilter === 'ALL' ? 700 : 500 }}
              >
                Todos
              </button>
              <button
                type="button"
                className={`btn-detail ${historyFilter === 'INTERNAL' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('INTERNAL')}
                style={{ fontWeight: historyFilter === 'INTERNAL' ? 700 : 500 }}
              >
                🏢 Entre sedes
              </button>
              <button
                type="button"
                className={`btn-detail ${historyFilter === 'OUTSIDE' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('OUTSIDE')}
                style={{ fontWeight: historyFilter === 'OUTSIDE' ? 700 : 500 }}
              >
                🚪 Fuera de la empresa
              </button>
            </div>
          </div>

          {filteredMovements.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '24px' }}>No hay movimientos registrados con el filtro seleccionado.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>Tag RFID</th>
                    <th>Unidades</th>
                    <th>Destino</th>
                    <th>Motivo y Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m) => {
                    const isOutside = m.destino_almacen === null && (m.tipo === 'DESPACHO_COMPLETO' || m.tipo === 'RETIRO_PARCIAL')
                    const isTransfer = m.destino_almacen !== null
                    return (
                      <tr key={m.id_movimiento}>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {new Date(m.fecha_hora).toLocaleString('es-PE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: isOutside ? '#FEE2E2' : isTransfer ? 'var(--color-brand-soft)' : '#E0E7FF',
                              color: isOutside ? 'var(--color-danger)' : isTransfer ? 'var(--color-brand)' : '#3730A3'
                            }}
                          >
                            {isOutside ? '🚪 SALIDA EXTERNA' : isTransfer ? '🔄 TRANSFERENCIA' : m.tipo}
                          </span>
                        </td>
                        <td>
                          <span className="sku-badge">{m.producto?.sku}</span>{' '}
                          <span style={{ fontSize: '0.88rem' }}>{m.producto?.nombre}</span>
                        </td>
                        <td>
                          {m.etiqueta_rfid?.uid_tag ? (
                            <strong style={{ color: 'var(--color-brand)' }}>{m.etiqueta_rfid.uid_tag}</strong>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <strong>{Number(m.cantidad_afectada).toLocaleString()} unid.</strong>
                        </td>
                        <td>
                          {isOutside ? (
                            <strong style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
                              Fuera de la empresa
                            </strong>
                          ) : m.destino?.nombre ? (
                            <span style={{ color: 'var(--color-brand)', fontWeight: 600, fontSize: '0.85rem' }}>
                              ➔ {m.destino.nombre}
                            </span>
                          ) : (
                            <span className="muted">Interno</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', maxWidth: '300px' }}>
                          {m.motivo || 'Sin motivo registrado'}
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
    </div>
  )
}
