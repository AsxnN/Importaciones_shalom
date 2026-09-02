import { useEffect, useState, type FormEvent } from 'react'
import { logCatalogChange } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'
import type { Supplier } from '../types'

type Props = {
  onError: (msg: string | null) => void
}

export function SuppliersSubView({ onError }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const [razonSocial, setRazonSocial] = useState('')
  const [calificacionOtif, setCalificacionOtif] = useState('')
  const [leadTimeDias, setLeadTimeDias] = useState('30')
  const [activo, setActivo] = useState(true)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadSuppliers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('proveedor')
      .select('id_proveedor, razon_social, calificacion_otif, tiempo_lead_time_dias, activo')
      .order('razon_social')

    if (error) {
      onError(error.message)
    } else {
      setSuppliers((data as Supplier[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadSuppliers()
  }, [])

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const razonClean = razonSocial.trim()
    if (!razonClean) {
      onError('La Razón Social del proveedor es obligatoria.')
      return
    }

    setSaving(true)
    onError(null)

    const payload = {
      razon_social: razonClean,
      calificacion_otif: calificacionOtif ? Number(calificacionOtif) : null,
      tiempo_lead_time_dias: leadTimeDias ? Number(leadTimeDias) : null,
      activo
    }

    if (editing) {
      const { error } = await supabase
        .from('proveedor')
        .update(payload)
        .eq('id_proveedor', editing.id_proveedor)

      setSaving(false)
      if (error) {
        onError(error.message)
        return
      }

      await logCatalogChange({
        tabla: 'proveedor',
        operacion: 'UPDATE',
        id_registro: editing.id_proveedor,
        datos_anteriores: editing,
        datos_nuevos: payload
      })
    } else {
      const { data, error } = await supabase
        .from('proveedor')
        .insert(payload)
        .select('id_proveedor')
        .single()

      setSaving(false)
      if (error) {
        onError(error.message)
        return
      }

      await logCatalogChange({
        tabla: 'proveedor',
        operacion: 'INSERT',
        id_registro: data?.id_proveedor ?? 0,
        datos_nuevos: payload
      })
    }

    resetForm()
    void loadSuppliers()
  }

  function startEdit(s: Supplier) {
    setEditing(s)
    setRazonSocial(s.razon_social)
    setCalificacionOtif(s.calificacion_otif ? String(s.calificacion_otif) : '')
    setLeadTimeDias(s.tiempo_lead_time_dias ? String(s.tiempo_lead_time_dias) : '30')
    setActivo(s.activo !== false)
  }

  function resetForm() {
    setEditing(null)
    setRazonSocial('')
    setCalificacionOtif('')
    setLeadTimeDias('30')
    setActivo(true)
  }

  return (
    <section className="panel master-section">
      <h3>Subvista 1.3 – Proveedores</h3>
      <p className="muted">Gestión de proveedores de importación, métricas OTIF y tiempo de entrega (Lead Time).</p>

      {/* Formulario */}
      <form className="product-form" onSubmit={handleSave} style={{ marginTop: '16px' }}>
        <h4>{editing ? `Editar Proveedor: ${editing.razon_social}` : 'Registrar Nuevo Proveedor'}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <label>
            Razón Social (obligatoria y única)
            <input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Ej. Importadora y Comercializadora Global S.A."
              required
            />
          </label>

          <label>
            Calificación OTIF (On-Time In-Full %)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={calificacionOtif}
              onChange={(e) => setCalificacionOtif(e.target.value)}
              placeholder="95.5"
            />
          </label>

          <label>
            Lead Time promedio (días de tránsito)
            <input
              type="number"
              min="1"
              value={leadTimeDias}
              onChange={(e) => setLeadTimeDias(e.target.value)}
              placeholder="30"
              required
            />
          </label>

          <label className="check" style={{ marginTop: '26px' }}>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Proveedor activo
          </label>
        </div>

        <div className="form-actions" style={{ marginTop: '16px' }}>
          <button className="button" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
          {editing && (
            <button className="button secondary" type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      {/* Tabla de Proveedores */}
      <div style={{ marginTop: '28px' }}>
        <h4>Proveedores registrados ({suppliers.length})</h4>
        {loading ? (
          <p className="muted">Cargando proveedores…</p>
        ) : suppliers.length === 0 ? (
          <p className="empty-state">No hay proveedores registrados aún.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Razón Social</th>
                  <th>Calificación OTIF</th>
                  <th>Lead Time (Días)</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id_proveedor}>
                    <td><strong>{s.razon_social}</strong></td>
                    <td>
                      {s.calificacion_otif !== null && s.calificacion_otif !== undefined ? (
                        <span style={{
                          fontWeight: 700,
                          color: Number(s.calificacion_otif) >= 90 ? '#187346' : Number(s.calificacion_otif) >= 75 ? '#c27e00' : '#ab1d22'
                        }}>
                          {Number(s.calificacion_otif).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>{s.tiempo_lead_time_dias ? `${s.tiempo_lead_time_dias} días` : '—'}</td>
                    <td>
                      <span className={s.activo !== false ? 'category-pill' : 'category-pill muted'}>
                        {s.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-detail" type="button" onClick={() => startEdit(s)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
