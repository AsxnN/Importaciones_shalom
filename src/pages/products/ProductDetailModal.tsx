import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { unidadSerializadaRepository } from './repositories/SerialUnitRepository'
import {
  getProductRule,
  getProductSerialProfile,
  type PerfilSerializado,
  type Product,
  type Rule,
  type UnidadSerializada
} from './types'

type ProductDetailModalProps = {
  product: Product | null
  onClose: () => void
  onPackagingUpdated?: () => void
}

export function ProductDetailModal({
  product,
  onClose,
  onPackagingUpdated
}: ProductDetailModalProps) {
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)

  // Estado para asignar o editar empaque (solo modo paletizado)
  const [editingPacking, setEditingPacking] = useState(false)
  const [savingPacking, setSavingPacking] = useState(false)
  const [packingError, setPackingError] = useState<string | null>(null)

  // Extraer perfiles
  const rule: Rule | null = useMemo(() => getProductRule(product), [product])
  const serialProfile: PerfilSerializado | null = useMemo(
    () => getProductSerialProfile(product),
    [product]
  )

  const modoManejo = product?.categoria?.modo_manejo || 'PALETIZADO'
  const isSerializado = modoManejo === 'SERIALIZADO'

  // Unidades serializadas físicas
  const [unidadesSeriales, setUnidadesSeriales] = useState<UnidadSerializada[]>([])
  const [loadingUnidades, setLoadingUnidades] = useState(false)
  const [showAddUnidad, setShowAddUnidad] = useState(false)
  const [nuevaSerie, setNuevaSerie] = useState('')
  const [nuevoTagRfid, setNuevoTagRfid] = useState('')
  const [guardandoUnidad, setGuardandoUnidad] = useState(false)
  const [errorUnidad, setErrorUnidad] = useState<string | null>(null)

  // Formulario de empaque (paletizado)
  const [formUnits, setFormUnits] = useState('1')
  const [formBoxesLayer, setFormBoxesLayer] = useState('1')
  const [formLayers, setFormLayers] = useState('1')
  const [formPuchos, setFormPuchos] = useState(true)
  const [formNotes, setFormNotes] = useState('')
  const [formLargo, setFormLargo] = useState('')
  const [formAncho, setFormAncho] = useState('')
  const [formAlto, setFormAlto] = useState('')
  const [formPeso, setFormPeso] = useState('')

  // Sincronizar formulario con los datos existentes al abrir
  useEffect(() => {
    if (rule) {
      setFormUnits(String(rule.unidades_por_caja ?? 1))
      setFormBoxesLayer(String(rule.cajas_por_camada ?? 1))
      setFormLayers(String(rule.numero_camadas ?? 1))
      setFormPuchos(rule.permite_puchos ?? true)
      setFormNotes(rule.notas_armado ?? '')
      setFormLargo(rule.largo_caja_cm ? String(rule.largo_caja_cm) : '')
      setFormAncho(rule.ancho_caja_cm ? String(rule.ancho_caja_cm) : '')
      setFormAlto(rule.alto_caja_cm ? String(rule.alto_caja_cm) : '')
      setFormPeso(rule.peso_caja_kg ? String(rule.peso_caja_kg) : '')
    } else {
      setFormUnits('1')
      setFormBoxesLayer('1')
      setFormLayers('1')
      setFormPuchos(true)
      setFormNotes('')
      setFormLargo('')
      setFormAncho('')
      setFormAlto('')
      setFormPeso('')
    }
    setEditingPacking(false)
    setPackingError(null)
  }, [rule, product])

  // Cargar unidades serializadas si es modo serializado
  useEffect(() => {
    if (isSerializado && product?.id_producto) {
      setLoadingUnidades(true)
      unidadSerializadaRepository
        .obtenerPorProducto(product.id_producto)
        .then((units) => setUnidadesSeriales(units))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Error al cargar unidades'
          setErrorUnidad(msg)
        })
        .finally(() => setLoadingUnidades(false))
    }
  }, [isSerializado, product?.id_producto])

  // Obtener URL firmada si hay imagen de armado
  useEffect(() => {
    let active = true
    const imagePath = rule?.imagen_armado_path

    if (!imagePath) {
      setSignedImageUrl(null)
      return
    }

    async function fetchImageUrl(filePath: string) {
      setLoadingImage(true)
      try {
        const { data, error } = await supabase.storage
          .from('esquemas-empaque')
          .createSignedUrl(filePath, 3600)

        if (active) {
          if (!error && data?.signedUrl) {
            setSignedImageUrl(data.signedUrl)
          } else {
            setSignedImageUrl(null)
          }
        }
      } catch {
        if (active) setSignedImageUrl(null)
      } finally {
        if (active) setLoadingImage(false)
      }
    }

    void fetchImageUrl(imagePath)
    return () => {
      active = false
    }
  }, [rule?.imagen_armado_path])

  if (!product) return null

  const cajasPaleta = rule
    ? (rule.cajas_por_camada ?? rule.cajas_por_camita ?? 0) *
      (rule.numero_camadas ?? rule.camitas_por_paleta ?? 0)
    : 0
  const unidadesPaleta = rule ? cajasPaleta * rule.unidades_por_caja : 0
  const volumenCajaM3 =
    rule?.largo_caja_cm && rule?.ancho_caja_cm && rule?.alto_caja_cm
      ? (rule.largo_caja_cm * rule.ancho_caja_cm * rule.alto_caja_cm) / 1000000
      : null
  const volumenPaletaM3 = volumenCajaM3 ? volumenCajaM3 * cajasPaleta : null
  const pesoPaletaKg = rule?.peso_caja_kg ? rule.peso_caja_kg * cajasPaleta + 25 : null
  const altoPaletaCm =
    rule?.alto_caja_cm && (rule?.numero_camadas ?? rule?.camitas_por_paleta)
      ? rule.alto_caja_cm * (rule.numero_camadas ?? rule.camitas_por_paleta ?? 0) + 15
      : null

  const serialVolumenM3 =
    serialProfile?.largo_cm && serialProfile?.ancho_cm && serialProfile?.alto_cm
      ? (serialProfile.largo_cm * serialProfile.ancho_cm * serialProfile.alto_cm) / 1000000
      : null

  async function handleSavePackaging(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!product) return

    setSavingPacking(true)
    setPackingError(null)

    const uCaja = Math.max(1, Number(formUnits) || 1)
    const cCamada = Math.max(1, Number(formBoxesLayer) || 1)
    const nCamadas = Math.max(1, Number(formLayers) || 1)

    const payload = {
      id_producto: Number(product.id_producto),
      unidades_por_caja: uCaja,
      cajas_por_camada: cCamada,
      numero_camadas: nCamadas,
      permite_puchos: formPuchos,
      notas_armado: formNotes.trim() || null,
      largo_caja_cm: formLargo ? Number(formLargo) : null,
      ancho_caja_cm: formAncho ? Number(formAncho) : null,
      alto_caja_cm: formAlto ? Number(formAlto) : null,
      peso_caja_kg: formPeso ? Number(formPeso) : null,
      cajas_por_camita: cCamada,
      camitas_por_paleta: nCamadas
    }

    const { error: upsertErr } = await supabase
      .from('regla_empaque')
      .upsert(payload, { onConflict: 'id_producto' })

    setSavingPacking(false)

    if (upsertErr) {
      setPackingError(upsertErr.message)
    } else {
      setEditingPacking(false)
      if (onPackagingUpdated) {
        onPackagingUpdated()
      }
    }
  }

  async function handleAddSerialUnit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!product || !nuevaSerie.trim()) return

    setGuardandoUnidad(true)
    setErrorUnidad(null)

    try {
      let idEtiqueta: number | null = null
      if (nuevoTagRfid.trim()) {
        const { data: tagData, error: tagErr } = await supabase
          .from('etiqueta_rfid')
          .insert({
            uid_tag: nuevoTagRfid.trim(),
            id_producto: Number(product.id_producto),
            tipo_paleta: 'COMPLETO',
            cantidad_paquetes: 1,
            cantidad_actual: 1,
            estado: 'ACTIVA',
            notas: `Serie: ${nuevaSerie.trim()}`
          })
          .select('id_etiqueta')
          .single()

        if (tagErr) {
          throw new Error(`Error al vincular tag RFID: ${tagErr.message}`)
        }
        idEtiqueta = tagData?.id_etiqueta ?? null
      }

      await unidadSerializadaRepository.guardar({
        id_producto: product.id_producto,
        numero_serie: nuevaSerie.trim(),
        id_etiqueta: idEtiqueta,
        estado: 'DISPONIBLE'
      })

      setNuevaSerie('')
      setNuevoTagRfid('')
      setShowAddUnidad(false)

      const updatedList = await unidadSerializadaRepository.obtenerPorProducto(product.id_producto)
      setUnidadesSeriales(updatedList)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar unidad serializada.'
      setErrorUnidad(msg)
    } finally {
      setGuardandoUnidad(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="sku-badge" style={{ fontSize: '0.95rem' }}>
              {product.sku}
            </span>
            <h3>{product.nombre ?? product.descripcion}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Categoría: <strong>{product.categoria?.nombre ?? 'Sin categoría'}</strong>
              </span>
              <span
                className="category-pill"
                style={{
                  background: isSerializado ? '#fef3c7' : '#e0f2fe',
                  color: isSerializado ? '#92400e' : '#0369a1',
                  borderColor: isSerializado ? '#fde68a' : '#bae6fd',
                  fontSize: '0.75rem'
                }}
              >
                {isSerializado ? 'Serializado unitario' : 'Paletizado estándar'}
              </span>
            </div>
          </div>
          <button
            className="modal-close-btn"
            type="button"
            title="Cerrar ficha"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {packingError && (
          <p className="error notice" role="alert" style={{ marginBottom: '16px' }}>
            {packingError}
          </p>
        )}

        {/* =================================================================== */}
        {/* VISTA MODO SERIALIZADO */}
        {/* =================================================================== */}
        {isSerializado ? (
          <div>
            {/* Especificaciones Técnicas del Equipo */}
            <div className="detail-section">
              <h4>Ficha técnica de maquinaria y equipo</h4>
              <div className="detail-stats-grid">
                <div className="stat-box highlight">
                  <span>Modo operativo</span>
                  <strong>Serializado unitario</strong>
                </div>
                <div className="stat-box">
                  <span>Peso unitario</span>
                  <strong>{serialProfile?.peso_unitario_kg ? `${serialProfile.peso_unitario_kg} kg` : product.peso_unitario_kg ? `${product.peso_unitario_kg} kg` : '—'}</strong>
                </div>
                <div className="stat-box">
                  <span>Dimensiones (L × An × Al)</span>
                  <strong>
                    {serialProfile?.largo_cm && serialProfile?.ancho_cm && serialProfile?.alto_cm
                      ? `${serialProfile.largo_cm} × ${serialProfile.ancho_cm} × ${serialProfile.alto_cm} cm`
                      : '—'}
                  </strong>
                </div>
                {serialVolumenM3 !== null && (
                  <div className="stat-box highlight">
                    <span>Volumen unitario</span>
                    <strong>{serialVolumenM3.toFixed(3)} m³</strong>
                  </div>
                )}
                <div className="stat-box">
                  <span>Ubicación permitida</span>
                  <strong>{serialProfile?.ubicacion_permitida || 'AMBAS'}</strong>
                </div>
                <div className="stat-box">
                  <span>Equipo de izaje</span>
                  <strong style={{ color: serialProfile?.requiere_equipo_izaje ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {serialProfile?.requiere_equipo_izaje ? 'Requiere grúa/clark' : 'No requiere'}
                  </strong>
                </div>
              </div>

              {serialProfile?.notas && (
                <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--color-canvas)', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block' }}>Notas técnicas / mantenimiento:</span>
                  <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                    {serialProfile.notas}
                  </p>
                </div>
              )}
            </div>

            {/* Unidades Serializadas Físicas Registradas */}
            <div className="detail-section" style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>Unidades serializadas registradas ({unidadesSeriales.length})</h4>
                <button
                  className="button"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', margin: 0 }}
                  type="button"
                  onClick={() => setShowAddUnidad(!showAddUnidad)}
                >
                  {showAddUnidad ? 'Cancelar' : '+ Enrolar unidad'}
                </button>
              </div>

              {errorUnidad && (
                <p className="error notice" role="alert" style={{ margin: '8px 0' }}>
                  {errorUnidad}
                </p>
              )}

              {/* Formulario para enrolar nueva unidad física */}
              {showAddUnidad && (
                <form
                  onSubmit={handleAddSerialUnit}
                  style={{
                    background: 'var(--color-canvas)',
                    padding: '16px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    marginBottom: '16px'
                  }}
                >
                  <h5 style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>Enrolar nueva unidad serializada</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <label>
                      Número de serie (único)
                      <input
                        value={nuevaSerie}
                        onChange={(e) => setNuevaSerie(e.target.value)}
                        placeholder="Ej. SN-GEN-2026-0042"
                        required
                      />
                    </label>
                    <label>
                      Código tag RFID (opcional)
                      <input
                        value={nuevoTagRfid}
                        onChange={(e) => setNuevoTagRfid(e.target.value)}
                        placeholder="Ej. IMP00042 o EPC"
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="button" style={{ margin: 0 }} disabled={guardandoUnidad}>
                      {guardandoUnidad ? 'Enrolando…' : 'Guardar unidad'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ margin: 0 }}
                      onClick={() => setShowAddUnidad(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {loadingUnidades ? (
                <p className="muted">Cargando unidades serializadas…</p>
              ) : unidadesSeriales.length === 0 ? (
                <p className="empty-state">No hay unidades serializadas enroladas para este equipo.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Número de Serie</th>
                        <th>Tag RFID</th>
                        <th>Almacén Actual</th>
                        <th>Estado</th>
                        <th>Fecha Ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unidadesSeriales.map((u) => (
                        <tr key={u.id_unidad}>
                          <td><strong>{u.numero_serie}</strong></td>
                          <td>
                            {u.etiqueta_rfid?.uid_tag ? (
                              <span className="sku-badge">{u.etiqueta_rfid.uid_tag}</span>
                            ) : (
                              <span className="muted">Sin RFID</span>
                            )}
                          </td>
                          <td>{u.almacen?.nombre ?? '—'}</td>
                          <td>
                            <span
                              className="category-pill"
                              style={{
                                background: u.estado === 'DISPONIBLE' ? '#dcfce7' : '#fee2e2',
                                color: u.estado === 'DISPONIBLE' ? '#166534' : '#991b1b',
                                fontSize: '0.75rem'
                              }}
                            >
                              {u.estado}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>
                            {new Date(u.fecha_ingreso).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* =================================================================== */
          /* VISTA MODO PALETIZADO */
          /* =================================================================== */
          <>
            {!rule && !editingPacking ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p className="empty-state" style={{ margin: '0 0 18px' }}>
                  Este producto no cuenta con regla de empaque asignada.
                </p>
                <button
                  className="button"
                  type="button"
                  style={{ margin: 0 }}
                  onClick={() => setEditingPacking(true)}
                >
                  + Asignar regla de empaque ahora
                </button>
              </div>
            ) : editingPacking ? (
              <form className="product-form" onSubmit={handleSavePackaging}>
                <h4>{rule ? 'Editar regla de empaque' : 'Asignar regla de empaque'}</h4>
                <fieldset>
                  <legend>Especificaciones de Paletizado</legend>
                  <div className="number-grid">
                    <label>
                      Unidades por caja
                      <input
                        type="number"
                        min="1"
                        value={formUnits}
                        onChange={(e) => setFormUnits(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Cajas por camada
                      <input
                        type="number"
                        min="1"
                        value={formBoxesLayer}
                        onChange={(e) => setFormBoxesLayer(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Camadas por paleta
                      <input
                        type="number"
                        min="1"
                        value={formLayers}
                        onChange={(e) => setFormLayers(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>
                    Notas de patrón de armado (opcional)
                    <input
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ej. 6 cajas horizontales + 2 verticales"
                    />
                  </label>

                  <div className="number-grid" style={{ marginTop: '12px' }}>
                    <label>
                      Largo caja (cm)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={formLargo}
                        onChange={(e) => setFormLargo(e.target.value)}
                      />
                    </label>
                    <label>
                      Ancho caja (cm)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={formAncho}
                        onChange={(e) => setFormAncho(e.target.value)}
                      />
                    </label>
                    <label>
                      Alto caja (cm)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={formAlto}
                        onChange={(e) => setFormAlto(e.target.value)}
                      />
                    </label>
                    <label>
                      Peso caja (kg)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formPeso}
                        onChange={(e) => setFormPeso(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={formPuchos}
                      onChange={(e) => setFormPuchos(e.target.checked)}
                    />
                    Permite cajas pucho (fraccionadas)
                  </label>

                  <div className="metrics">
                    <span>{Number(formBoxesLayer) * Number(formLayers)} cajas/paleta</span>
                    <strong>
                      {Number(formBoxesLayer) * Number(formLayers) * Number(formUnits)} unidades/paleta
                    </strong>
                  </div>
                </fieldset>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button className="button" style={{ margin: 0 }} disabled={savingPacking}>
                    {savingPacking ? 'Guardando…' : 'Guardar empaque'}
                  </button>
                  {rule && (
                    <button
                      className="button secondary"
                      type="button"
                      style={{ margin: 0 }}
                      onClick={() => setEditingPacking(false)}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            ) : rule ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                  <button
                    className="btn-detail"
                    type="button"
                    onClick={() => setEditingPacking(true)}
                  >
                    ✎ Modificar empaque
                  </button>
                </div>

                <div className="detail-section">
                  <h4>Especificaciones de paletizado y estibado</h4>
                  <div className="detail-stats-grid">
                    <div className="stat-box">
                      <span>Unidades por caja</span>
                      <strong>{rule.unidades_por_caja}</strong>
                    </div>
                    <div className="stat-box">
                      <span>Cajas por camada</span>
                      <strong>{rule.cajas_por_camada}</strong>
                    </div>
                    <div className="stat-box">
                      <span>Camadas por paleta</span>
                      <strong>{rule.numero_camadas}</strong>
                    </div>
                    <div className="stat-box highlight">
                      <span>Total cajas por paleta</span>
                      <strong>{cajasPaleta}</strong>
                    </div>
                    <div className="stat-box highlight">
                      <span>Total unidades por paleta</span>
                      <strong>{unidadesPaleta}</strong>
                    </div>
                    <div className="stat-box">
                      <span>Permite puchos</span>
                      <strong>{rule.permite_puchos ? 'Sí' : 'No'}</strong>
                    </div>
                  </div>
                </div>

                {(rule.largo_caja_cm || rule.ancho_caja_cm || rule.alto_caja_cm || rule.peso_caja_kg) && (
                  <div className="detail-section">
                    <h4>Dimensiones físicas y cubicaje</h4>
                    <div className="detail-stats-grid">
                      <div className="stat-box">
                        <span>Medidas caja (cm)</span>
                        <strong>
                          {rule.largo_caja_cm ?? '—'} × {rule.ancho_caja_cm ?? '—'} × {rule.alto_caja_cm ?? '—'}
                        </strong>
                      </div>
                      <div className="stat-box">
                        <span>Peso por caja</span>
                        <strong>{rule.peso_caja_kg ? `${rule.peso_caja_kg} kg` : '—'}</strong>
                      </div>
                      {altoPaletaCm !== null && (
                        <div className="stat-box highlight">
                          <span>Alto estimado paleta</span>
                          <strong>{altoPaletaCm.toFixed(1)} cm</strong>
                        </div>
                      )}
                      {volumenCajaM3 !== null && (
                        <div className="stat-box">
                          <span>Volumen caja</span>
                          <strong>{volumenCajaM3.toFixed(4)} m³</strong>
                        </div>
                      )}
                      {volumenPaletaM3 !== null && (
                        <div className="stat-box highlight">
                          <span>Volumen paleta</span>
                          <strong>{volumenPaletaM3.toFixed(3)} m³</strong>
                        </div>
                      )}
                      {pesoPaletaKg !== null && (
                        <div className="stat-box highlight">
                          <span>Peso estimado paleta</span>
                          <strong>{pesoPaletaKg.toFixed(1)} kg</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="detail-section">
                  <h4>Patrón de armado de camada</h4>
                  {rule.notas_armado ? (
                    <p style={{ margin: '0 0 10px', fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
                      <strong>Instrucciones:</strong> {rule.notas_armado}
                    </p>
                  ) : (
                    <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                      Sin notas específicas de armado registradas.
                    </p>
                  )}

                  {rule.imagen_armado_path ? (
                    <div className="diagram-box">
                      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                        Diagrama almacenado en: <code>{rule.imagen_armado_path}</code>
                      </p>
                      {loadingImage ? (
                        <p className="muted">Cargando esquema desde Supabase Storage…</p>
                      ) : signedImageUrl ? (
                        <div>
                          <img src={signedImageUrl} alt={`Esquema de ${product.sku}`} />
                          <div style={{ marginTop: '10px' }}>
                            <a
                              href={signedImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="link-button"
                              style={{ fontSize: '0.82rem' }}
                            >
                              Ver imagen completa en nueva pestaña ↗
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p className="notice" style={{ margin: '10px 0 0' }}>
                          No se pudo generar la URL de lectura de la imagen o no cuentas con los permisos requeridos.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: '0.85rem' }}>
                      No se ha adjuntado diagrama visual de armado para este producto.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}

        <div style={{ textAlign: 'right', marginTop: '22px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
          <button className="button secondary" type="button" onClick={onClose}>
            Cerrar ficha
          </button>
        </div>
      </div>
    </div>
  )
}
