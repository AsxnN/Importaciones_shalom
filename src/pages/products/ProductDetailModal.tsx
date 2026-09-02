import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { getProductRule, type Product, type Rule } from './types'

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

  // Estado para asignar o editar empaque si no existe o se desea modificar
  const [editingPacking, setEditingPacking] = useState(false)
  const [savingPacking, setSavingPacking] = useState(false)
  const [packingError, setPackingError] = useState<string | null>(null)

  // Extraer la regla de empaque soportando tanto Objeto (1 a 1 de PostgREST) como Array
  const rule: Rule | null = useMemo(() => getProductRule(product), [product])

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

  async function handleSavePackaging(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!product) return

    setSavingPacking(true)
    setPackingError(null)

    const uCaja = Math.max(1, Number(formUnits) || 1)
    const cCamada = Math.max(1, Number(formBoxesLayer) || 1)
    const nCamadas = Math.max(1, Number(formLayers) || 1)

    const payload = {
      id_producto: product.id_producto,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="sku-badge" style={{ fontSize: '0.95rem' }}>
              {product.sku}
            </span>
            <h3>{product.descripcion}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Categoría: <strong>{product.categoria?.nombre ?? 'Sin categoría'}</strong>
            </p>
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
          /* Formulario para asignar o editar regla de empaque */
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
                  Cajas por camada (total real por cama)
                  <input
                    type="number"
                    min="1"
                    value={formBoxesLayer}
                    onChange={(e) => setFormBoxesLayer(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Niveles / Camadas por paleta
                  <input
                    type="number"
                    min="1"
                    value={formLayers}
                    onChange={(e) => setFormLayers(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: '6px', margin: '12px 0 0', fontWeight: 700, fontSize: '0.85rem' }}>
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
          /* Vista de Ficha de Empaque Completa */
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

            {/* Especificaciones de Paletizado y Estibado */}
            <div className="detail-section">
              <h4>Especificaciones de Paletizado y Estibado</h4>
              <div className="detail-stats-grid">
                <div className="stat-box">
                  <span>Unidades / Caja</span>
                  <strong>{rule.unidades_por_caja}</strong>
                </div>
                <div className="stat-box">
                  <span>Cajas / Camada</span>
                  <strong>{rule.cajas_por_camada}</strong>
                </div>
                <div className="stat-box">
                  <span>Camadas / Paleta</span>
                  <strong>{rule.numero_camadas}</strong>
                </div>
                <div className="stat-box highlight">
                  <span>Total Cajas / Paleta</span>
                  <strong>{cajasPaleta}</strong>
                </div>
                <div className="stat-box highlight">
                  <span>Total Unidades / Paleta</span>
                  <strong>{unidadesPaleta}</strong>
                </div>
                <div className="stat-box">
                  <span>Permite Puchos</span>
                  <strong>{rule.permite_puchos ? 'Sí' : 'No'}</strong>
                </div>
              </div>
            </div>

            {/* Dimensiones Físicas y Cubicaje */}
            {(rule.largo_caja_cm || rule.ancho_caja_cm || rule.alto_caja_cm || rule.peso_caja_kg) && (
              <div className="detail-section">
                <h4>Dimensiones Físicas y Cubicaje</h4>
                <div className="detail-stats-grid">
                  <div className="stat-box">
                    <span>Medidas Caja (cm)</span>
                    <strong>
                      {rule.largo_caja_cm ?? '—'} × {rule.ancho_caja_cm ?? '—'} × {rule.alto_caja_cm ?? '—'}
                    </strong>
                  </div>
                  <div className="stat-box">
                    <span>Peso por Caja</span>
                    <strong>{rule.peso_caja_kg ? `${rule.peso_caja_kg} kg` : '—'}</strong>
                  </div>
                  {altoPaletaCm !== null && (
                    <div className="stat-box highlight">
                      <span>Alto Estimado Paleta</span>
                      <strong>{altoPaletaCm.toFixed(1)} cm</strong>
                    </div>
                  )}
                  {volumenCajaM3 !== null && (
                    <div className="stat-box">
                      <span>Volumen Caja</span>
                      <strong>{volumenCajaM3.toFixed(4)} m³</strong>
                    </div>
                  )}
                  {volumenPaletaM3 !== null && (
                    <div className="stat-box highlight">
                      <span>Volumen Paleta</span>
                      <strong>{volumenPaletaM3.toFixed(3)} m³</strong>
                    </div>
                  )}
                  {pesoPaletaKg !== null && (
                    <div className="stat-box highlight">
                      <span>Peso Estimado Paleta</span>
                      <strong>{pesoPaletaKg.toFixed(1)} kg</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Patrón de Armado y Diagrama */}
            <div className="detail-section">
              <h4>Patrón de Armado de Camada</h4>
              {rule.notas_armado ? (
                <p style={{ margin: '0 0 10px', fontSize: '0.92rem', color: '#27382d' }}>
                  <strong>Instrucciones:</strong> {rule.notas_armado}
                </p>
              ) : (
                <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                  Sin notas específicas de armado registradas.
                </p>
              )}

              {rule.imagen_armado_path ? (
                <div className="diagram-box">
                  <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#5d6b62' }}>
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

        <div style={{ textAlign: 'right', marginTop: '22px', borderTop: '1px solid #edf1ee', paddingTop: '16px' }}>
          <button className="button secondary" type="button" onClick={onClose}>
            Cerrar ficha
          </button>
        </div>
      </div>
    </div>
  )
}
