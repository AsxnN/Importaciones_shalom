import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { auditService } from '../services/auditService'
import type { AuditSession, PalletAuditReading, ProductAuditItem, ScanMethod } from '../types/audits'

type Warehouse = {
  id_almacen: number
  nombre: string
  tipo: string
  activo: boolean
}

type Props = {
  onBack: () => void
}

export function AuditsPage({ onBack }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWhId, setSelectedWhId] = useState<number | null>(null)
  const [auditHistory, setAuditHistory] = useState<AuditSession[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Estado de la Auditoría Activa
  const [activeSession, setActiveSession] = useState<AuditSession | null>(null)
  const [auditProducts, setAuditProducts] = useState<ProductAuditItem[]>([])
  const [auditReadings, setAuditReadings] = useState<PalletAuditReading[]>([])

  // Navegación dentro de la auditoría: vista lista de productos vs vista detalle de producto
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)

  // Escaneo manual/simulado
  const [scanInput, setScanInput] = useState('')
  const [scanMethod, setScanMethod] = useState<ScanMethod>('RFID')

  // Nota de confirmación al completar un producto
  const [confirmationNote, setConfirmationNote] = useState('')
  const [savingProductConfirm, setSavingProductConfirm] = useState(false)

  // Modal para Finalizar Auditoría
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [generalObservations, setGeneralObservations] = useState('')
  const [finishingAudit, setFinishingAudit] = useState(false)

  // Cargar Almacenes e Historial
  const loadInitialData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data: whData } = await supabase
        .from('almacen')
        .select('id_almacen, nombre, tipo, activo')
        .eq('activo', true)
        .order('id_almacen')

      const whList = (whData as Warehouse[]) || []
      setWarehouses(whList)
      if (whList.length > 0 && selectedWhId === null) {
        setSelectedWhId(whList[0].id_almacen)
      }

      const history = await auditService.getAuditHistory(selectedWhId || undefined)
      setAuditHistory(history)
    } catch (err: any) {
      setErrorMsg(`Error inicializando auditorías: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recargar historial al cambiar de almacén (cuando no hay auditoría en curso)
  useEffect(() => {
    if (selectedWhId && !activeSession) {
      void (async () => {
        const history = await auditService.getAuditHistory(selectedWhId)
        setAuditHistory(history)
      })()
    }
  }, [selectedWhId, activeSession])

  const selectedWarehouse = useMemo(() => {
    return warehouses.find((w) => w.id_almacen === selectedWhId)
  }, [warehouses, selectedWhId])

  // Iniciar una nueva auditoría
  async function handleStartAudit() {
    if (!selectedWhId || !selectedWarehouse) return

    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await auditService.startAuditSession(
        selectedWhId,
        selectedWarehouse.nombre,
        1,
        'Auditor en Turno'
      )
      setActiveSession(res.session)
      setAuditProducts(res.products)
      setAuditReadings(res.readings)
      setSelectedProductId(null)
      setSuccessMsg(`Auditoría iniciada para ${selectedWarehouse.nombre}. Selecciona un producto para auditar.`)
    } catch (err: any) {
      setErrorMsg(`Error al iniciar auditoría: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Producto actualmente seleccionado para auditar en detalle
  const currentProductItem = useMemo(() => {
    if (!selectedProductId) return null
    return auditProducts.find((p) => p.id_producto === selectedProductId) || null
  }, [auditProducts, selectedProductId])

  // Paletas del producto seleccionado
  const currentProductReadings = useMemo(() => {
    if (!selectedProductId) return []
    return auditReadings.filter((r) => r.id_producto === selectedProductId)
  }, [auditReadings, selectedProductId])

  // Verificar si todas las paletas de este producto ya fueron escaneadas
  const allPalletsScannedForCurrent = useMemo(() => {
    if (currentProductReadings.length === 0) return false
    return currentProductReadings.every((r) => r.leido)
  }, [currentProductReadings])

  // Registrar escaneo de paleta
  async function handleScanSubmit(e?: React.FormEvent, customCode?: string, customMethod?: ScanMethod) {
    if (e) e.preventDefault()
    if (!activeSession || !selectedProductId) return

    const codeToScan = customCode || scanInput
    const methodToUse = customMethod || scanMethod

    if (!codeToScan.trim()) return

    setErrorMsg(null)
    try {
      const res = await auditService.recordScan(
        activeSession.id_auditoria,
        selectedProductId,
        codeToScan,
        methodToUse
      )

      if (!res.reading) {
        setErrorMsg(`Código "${codeToScan}" no corresponde a ninguna paleta esperada para este producto.`)
        return
      }

      // Actualizar estado local
      setAuditReadings((prev) =>
        prev.map((r) => (r.id_lectura === res.reading!.id_lectura ? res.reading! : r))
      )

      if (res.product) {
        setAuditProducts((prev) =>
          prev.map((p) => (p.id_producto === res.product!.id_producto ? res.product! : p))
        )
      }

      setScanInput('')
      setSuccessMsg(`Paleta ${res.reading.uid_tag} validada correctamente (${res.reading.codigo_ubicacion_esperada}).`)
    } catch (err: any) {
      setErrorMsg(`Error al procesar lectura: ${err.message}`)
    }
  }

  // Confirmar y marcar el producto como AUDITADO con nota obligatoria
  async function handleConfirmProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSession || !selectedProductId) return
    if (!confirmationNote.trim()) {
      setErrorMsg('Es obligatorio ingresar un comentario o nota de confirmación para cerrar este producto.')
      return
    }

    setSavingProductConfirm(true)
    setErrorMsg(null)
    try {
      const updatedProduct = await auditService.confirmProductAudit(
        activeSession.id_auditoria,
        selectedProductId,
        confirmationNote
      )

      setAuditProducts((prev) =>
        prev.map((p) => (p.id_producto === updatedProduct.id_producto ? updatedProduct : p))
      )

      setSuccessMsg(`Producto "${updatedProduct.sku}" marcado como AUDITADO conforme.`)
      setConfirmationNote('')
      setSelectedProductId(null) // Volver a la lista general de productos
    } catch (err: any) {
      setErrorMsg(`Error al confirmar producto: ${err.message}`)
    } finally {
      setSavingProductConfirm(false)
    }
  }

  // Guardar y Finalizar la Auditoría (Parcial o Completa)
  async function handleFinishAudit() {
    if (!activeSession) return

    setFinishingAudit(true)
    setErrorMsg(null)
    try {
      const finished = await auditService.finishAudit(
        activeSession.id_auditoria,
        generalObservations
      )

      setSuccessMsg(
        `Auditoría finalizada con estado ${finished.estado} (${finished.productos_auditados}/${finished.total_productos} productos auditados, ERI: ${finished.porcentaje_eri}%).`
      )
      setActiveSession(null)
      setShowFinishModal(false)
      setSelectedProductId(null)
      setGeneralObservations('')

      // Recargar historial
      const history = await auditService.getAuditHistory(selectedWhId || undefined)
      setAuditHistory(history)
    } catch (err: any) {
      setErrorMsg(`Error al finalizar auditoría: ${err.message}`)
    } finally {
      setFinishingAudit(false)
    }
  }

  // Productos pendientes (para la alerta de guardado parcial)
  const pendingProductsCount = useMemo(() => {
    return auditProducts.filter((p) => p.estado === 'PENDIENTE').length
  }, [auditProducts])

  return (
    <main className="app-workspace" style={{ padding: '24px 32px' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <button
              type="button"
              onClick={activeSession ? () => setActiveSession(null) : onBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand)',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0
              }}
            >
              ← {activeSession ? 'Salir de auditoría' : 'Volver al resumen'}
            </button>
            <span style={{ color: 'var(--color-text-secondary)' }}>/</span>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Módulo 05 · Auditorías ERI
            </span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
            {activeSession ? `Auditoría en Curso · ${activeSession.almacen_nombre}` : 'Auditorías de Exactitud de Registro (ERI)'}
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            {activeSession
              ? 'Verificación producto por producto. Escaneo de RFID y código de barras con validación semafórica.'
              : 'Supervisión de existencias físicas en racks y campo mediante conteo ciego o selectivo.'}
          </p>
        </div>

        {/* Acciones principales en cabecera */}
        {!activeSession && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedWhId || ''}
              onChange={(e) => setSelectedWhId(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-brand-deep)',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id_almacen} value={w.id_almacen}>
                  {w.nombre} ({w.tipo})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="action-button primary"
              onClick={handleStartAudit}
              disabled={loading || !selectedWhId}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span>+ Iniciar nueva auditoría</span>
            </button>
          </div>
        )}
      </div>

      {/* Alertas Globales */}
      {errorMsg && (
        <div className="login-error-banner" role="alert" style={{ marginBottom: '16px' }}>
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
            fontWeight: 500,
            marginBottom: '16px'
          }}
        >
          {successMsg}
        </div>
      )}

      {/* CASO 1: AUDITORÍA EN CURSO */}
      {activeSession ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Barra de Progreso y Métricas de la Sesión */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  Progreso por Producto
                </span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-brand-deep)', fontFamily: 'var(--font-display)' }}>
                  {activeSession.productos_auditados} de {activeSession.total_productos} productos
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  Paletas Validadas
                </span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-brand)', fontFamily: 'var(--font-display)' }}>
                  {activeSession.paletas_auditadas} de {activeSession.paletas_esperadas}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  Fecha y Hora
                </span>
                <div style={{ fontSize: '14px', color: 'var(--color-brand-deep)', fontWeight: 500 }}>
                  {new Date(activeSession.fecha_inicio).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="action-button primary"
              onClick={() => setShowFinishModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>Guardar y finalizar auditoría</span>
            </button>
          </div>

          {/* SUB-VISTA A: DETALLE DEL PRODUCTO SELECCIONADO (AUDITORÍA PALETA POR PALETA) */}
          {selectedProductId && currentProductItem ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '20px'
                }}
              >
                {/* Cabecera del Producto */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedProductId(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-brand)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        padding: 0,
                        marginBottom: '4px'
                      }}
                    >
                      ← Volver a lista de productos
                    </button>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
                      {currentProductItem.sku} — {currentProductItem.nombre}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                      Acerca el lector RFID (NFC) o escanea el código de barras de cada paleta para verificar su presencia.
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: currentProductItem.estado === 'AUDITADO'
                          ? 'var(--color-status-green-bg)'
                          : 'var(--color-status-red-bg)',
                        color: currentProductItem.estado === 'AUDITADO'
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                        border: currentProductItem.estado === 'AUDITADO'
                          ? '1px solid var(--color-status-green-border)'
                          : '1px solid var(--color-status-red-border)'
                      }}
                    >
                      {currentProductItem.estado === 'AUDITADO' ? '🟢 Producto auditado' : '🔴 Auditoría pendiente'}
                    </span>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      Paletas verificadas: {currentProductItem.paletas_leidas} / {currentProductItem.paletas_esperadas}
                    </div>
                  </div>
                </div>

                {/* Barra de Escaneo Táctico */}
                <form
                  onSubmit={(e) => void handleScanSubmit(e)}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '14px',
                    backgroundColor: 'var(--color-canvas)',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    flexWrap: 'wrap'
                  }}
                >
                  <select
                    value={scanMethod}
                    onChange={(e) => setScanMethod(e.target.value as ScanMethod)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      backgroundColor: 'var(--color-surface)',
                      fontSize: '13px',
                      fontWeight: 500
                    }}
                  >
                    <option value="RFID">Sensor RFID / NFC</option>
                    <option value="CODIGO_BARRAS">Lector Código de Barras</option>
                    <option value="MANUAL">Ingreso Manual</option>
                  </select>

                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Escanear o ingresar UID RFID / Código de barras…"
                    style={{
                      flex: 1,
                      minWidth: '220px',
                      padding: '8px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />

                  <button type="submit" className="action-button primary" style={{ fontSize: '13px' }}>
                    Validar lectura
                  </button>
                </form>

                {/* Lista de Paletas del Producto */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'center', width: '90px' }}>Semáforo</th>
                        <th style={{ textAlign: 'left' }}>Tag RFID / Código Barras</th>
                        <th style={{ textAlign: 'left' }}>Ubicación en Rack / Campo</th>
                        <th style={{ textAlign: 'left' }}>Tipo Paleta</th>
                        <th style={{ textAlign: 'right' }}>Bultos</th>
                        <th style={{ textAlign: 'left' }}>Hora de Lectura</th>
                        <th style={{ textAlign: 'center' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentProductReadings.map((r) => (
                        <tr
                          key={r.id_lectura}
                          style={{
                            backgroundColor: r.leido ? 'rgba(47, 125, 79, 0.05)' : undefined
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: r.leido
                                  ? 'var(--color-status-green-bg)'
                                  : 'var(--color-status-red-bg)',
                                color: r.leido
                                  ? 'var(--color-success)'
                                  : 'var(--color-danger)',
                                border: r.leido
                                  ? '1px solid var(--color-status-green-border)'
                                  : '1px solid var(--color-status-red-border)'
                              }}
                            >
                              {r.leido ? '🟢 LEÍDO' : '🔴 PENDIENTE'}
                            </span>
                          </td>
                          <td>
                            <code style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
                              {r.uid_tag}
                            </code>
                            {r.codigo_barras && (
                              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                Barra: {r.codigo_barras}
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: r.tipo_ubicacion === 'CAMPO'
                                  ? 'rgba(188, 121, 31, 0.12)'
                                  : 'var(--color-brand-soft)',
                                color: r.tipo_ubicacion === 'CAMPO'
                                  ? 'var(--color-warning)'
                                  : 'var(--color-brand-deep)'
                              }}
                            >
                              {r.codigo_ubicacion_esperada}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${r.tipo_paleta === 'COMPLETO' ? 'active' : 'inactive'}`}>
                              {r.tipo_paleta === 'COMPLETO' ? 'Paleta entera' : 'Pucho'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.cantidad_paquetes}</td>
                          <td>
                            {r.fecha_lectura ? (
                              <span style={{ fontSize: '12px', color: 'var(--color-brand-deep)' }}>
                                {new Date(r.fecha_lectura).toLocaleTimeString('es-PE')} ({r.metodo_lectura})
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!r.leido ? (
                              <button
                                type="button"
                                className="action-button primary"
                                onClick={() => void handleScanSubmit(undefined, r.uid_tag, 'RFID')}
                                style={{ padding: '3px 10px', fontSize: '11px' }}
                              >
                                Escanear
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 600 }}>
                                ✓ Verificada
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* SECCIÓN OBLIGATORIA: CONFIRMAR PRODUCTO AL COMPLETAR */}
                {allPalletsScannedForCurrent && (
                  <form
                    onSubmit={handleConfirmProduct}
                    style={{
                      marginTop: '24px',
                      padding: '16px 20px',
                      backgroundColor: 'var(--color-brand-soft)',
                      border: '1px solid var(--color-brand)',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>✅</span>
                      <div>
                        <strong style={{ color: 'var(--color-brand-deep)', fontSize: '15px' }}>
                          Todas las paletas han sido verificadas físicamente.
                        </strong>
                        <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          Para marcar este producto en verde en la auditoría general, es obligatorio registrar una nota o comentario de confirmación.
                        </p>
                      </div>
                    </div>

                    <textarea
                      required
                      rows={2}
                      value={confirmationNote}
                      onChange={(e) => setConfirmationNote(e.target.value)}
                      placeholder="Escribe el comentario de confirmación (ej. Mercancía en orden, estiba conforme, embalaje intacto)…"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        fontSize: '14px',
                        backgroundColor: 'var(--color-surface)',
                        boxSizing: 'border-box'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="submit"
                        className="action-button primary"
                        disabled={savingProductConfirm}
                        style={{ fontSize: '13px', padding: '8px 18px' }}
                      >
                        {savingProductConfirm ? 'Confirmando…' : 'Confirmar y marcar producto como AUDITADO'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            /* SUB-VISTA B: LISTA GENERAL DE PRODUCTOS EN STOCK (AUDITORÍA PRINCIPAL) */
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '20px'
              }}
            >
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
                  Lista de Productos a Auditar ({auditProducts.length})
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                  Selecciona de producto en producto para auditar sus paletas de forma separada y evitar sobrecarga en la app.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', width: '110px' }}>Estado</th>
                      <th style={{ textAlign: 'left' }}>SKU / Código</th>
                      <th style={{ textAlign: 'left' }}>Nombre del Producto</th>
                      <th style={{ textAlign: 'center' }}>Paletas Esperadas</th>
                      <th style={{ textAlign: 'center' }}>Paletas Leídas</th>
                      <th style={{ textAlign: 'left' }}>Nota de Confirmación</th>
                      <th style={{ textAlign: 'center', width: '150px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditProducts.map((p) => {
                      const isAudited = p.estado === 'AUDITADO'
                      return (
                        <tr
                          key={p.id_producto}
                          style={{
                            backgroundColor: isAudited ? 'rgba(47, 125, 79, 0.04)' : undefined
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: isAudited
                                  ? 'var(--color-status-green-bg)'
                                  : 'var(--color-status-red-bg)',
                                color: isAudited
                                  ? 'var(--color-success)'
                                  : 'var(--color-danger)',
                                border: isAudited
                                  ? '1px solid var(--color-status-green-border)'
                                  : '1px solid var(--color-status-red-border)'
                              }}
                            >
                              {isAudited ? '🟢 AUDITADO' : '🔴 PENDIENTE'}
                            </span>
                          </td>
                          <td>
                            <strong>{p.sku}</strong>
                          </td>
                          <td>{p.nombre}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.paletas_esperadas}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: isAudited ? 'var(--color-success)' : 'var(--color-brand)' }}>
                            {p.paletas_leidas}
                          </td>
                          <td>
                            {p.nota_confirmacion ? (
                              <span style={{ fontSize: '13px', color: 'var(--color-brand-deep)' }}>
                                «{p.nota_confirmacion}»
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Sin confirmar</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className={`action-button ${isAudited ? 'secondary' : 'primary'}`}
                              onClick={() => setSelectedProductId(p.id_producto)}
                              style={{ fontSize: '12px', padding: '5px 12px' }}
                            >
                              {isAudited ? 'Revisar paletas' : 'Auditar producto →'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODAL PARA FINALIZAR AUDITORÍA (COMPLETA O PARCIAL) */}
          {showFinishModal && (
            <div className="modal-backdrop" role="dialog" aria-modal="true">
              <div className="modal-card" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                  <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                    Cerrar y Guardar Sesión de Auditoría
                  </h3>
                  <button
                    type="button"
                    className="modal-close-button"
                    onClick={() => setShowFinishModal(false)}
                    aria-label="Cerrar modal"
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {pendingProductsCount > 0 ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        backgroundColor: 'rgba(188, 121, 31, 0.12)',
                        border: '1px solid rgba(188, 121, 31, 0.3)',
                        borderRadius: '4px',
                        color: 'var(--color-warning)',
                        fontSize: '13px',
                        lineHeight: '1.4'
                      }}
                    >
                      ⚠️ <strong>Aviso de Auditoría Parcial:</strong> Faltan{' '}
                      <strong>{pendingProductsCount}</strong> producto(s) por auditar. El sistema registrará la auditoría con estado{' '}
                      <strong>PARCIAL</strong> para que conste la verificación de hoy y pueda ser consultada posteriormente.
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '12px 14px',
                        backgroundColor: 'var(--color-status-green-bg)',
                        border: '1px solid var(--color-status-green-border)',
                        borderRadius: '4px',
                        color: 'var(--color-success)',
                        fontSize: '13px'
                      }}
                    >
                      ✓ <strong>Auditoría Completa:</strong> Todos los productos han sido auditados conforme al 100%.
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
                      Observaciones Generales de la Auditoría (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={generalObservations}
                      onChange={(e) => setGeneralObservations(e.target.value)}
                      placeholder="Comentarios del auditor sobre el estado físico de los racks, novedades o motivos de cierre parcial…"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="action-button secondary"
                      onClick={() => setShowFinishModal(false)}
                      disabled={finishingAudit}
                    >
                      Continuar auditando
                    </button>
                    <button
                      type="button"
                      className="action-button primary"
                      onClick={handleFinishAudit}
                      disabled={finishingAudit}
                    >
                      {finishingAudit ? 'Guardando…' : 'Guardar y cerrar auditoría'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CASO 2: SIN AUDITORÍA EN CURSO (HISTORIAL DE AUDITORÍAS) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Tira de Resumen de Auditorías */}
          <div className="inventory-metric-strip">
            <div className="metric-box">
              <span className="metric-label">Auditorías Realizadas</span>
              <span className="metric-value">{auditHistory.length}</span>
              <span className="metric-subtext">Histórico en sistema</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Auditorías Completas</span>
              <span className="metric-value" style={{ color: 'var(--color-success)' }}>
                {auditHistory.filter((a) => a.estado === 'COMPLETADA').length}
              </span>
              <span className="metric-subtext">Conformidad 100%</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Auditorías Parciales</span>
              <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
                {auditHistory.filter((a) => a.estado === 'PARCIAL').length}
              </span>
              <span className="metric-subtext">Con pendientes</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Promedio ERI General</span>
              <span className="metric-value" style={{ color: 'var(--color-brand)' }}>
                {auditHistory.length > 0
                  ? `${(auditHistory.reduce((acc, c) => acc + c.porcentaje_eri, 0) / auditHistory.length).toFixed(1)}%`
                  : '—'}
              </span>
              <span className="metric-subtext">Exactitud de inventario</span>
            </div>
          </div>

          {/* Tabla de Histórico de Auditorías */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '20px'
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
                Historial de Auditorías por Fecha
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Registro inmutable de inspecciones de existencias físicas para verificación y auditoría forense.
              </p>
            </div>

            {auditHistory.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                No hay auditorías registradas para este almacén. Haz clic en <strong>+ Iniciar nueva auditoría</strong>.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Fecha y Hora</th>
                      <th style={{ textAlign: 'left' }}>Sede / Almacén</th>
                      <th style={{ textAlign: 'left' }}>Auditor</th>
                      <th style={{ textAlign: 'center' }}>SKUs Auditados</th>
                      <th style={{ textAlign: 'center' }}>Paletas Leídas</th>
                      <th style={{ textAlign: 'center' }}>Índice ERI</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                      <th style={{ textAlign: 'left' }}>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditHistory.map((a) => {
                      const isComplete = a.estado === 'COMPLETADA'
                      return (
                        <tr key={a.id_auditoria}>
                          <td>
                            <strong>
                              {new Date(a.fecha_inicio).toLocaleDateString('es-PE', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </strong>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {new Date(a.fecha_inicio).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td>{a.almacen_nombre}</td>
                          <td>{a.usuario_nombre}</td>
                          <td style={{ textAlign: 'center' }}>
                            {a.productos_auditados} / {a.total_productos}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {a.paletas_auditadas} / {a.paletas_esperadas}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: isComplete ? 'var(--color-success)' : 'var(--color-warning)' }}>
                            {a.porcentaje_eri}%
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: isComplete
                                  ? 'var(--color-status-green-bg)'
                                  : 'rgba(188, 121, 31, 0.12)',
                                color: isComplete
                                  ? 'var(--color-success)'
                                  : 'var(--color-warning)',
                                border: isComplete
                                  ? '1px solid var(--color-status-green-border)'
                                  : '1px solid rgba(188, 121, 31, 0.3)'
                              }}
                            >
                              {isComplete ? 'COMPLETADA' : 'PARCIAL'}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            {a.observaciones || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
