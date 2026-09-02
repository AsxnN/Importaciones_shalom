import { useState, type FormEvent } from 'react'
import { logCatalogChange } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'
import type { Category } from '../types'

type Props = {
  categories: Category[]
  loading: boolean
  onRefresh: () => void
  onError: (msg: string | null) => void
}

export function CategoriesSubView({ categories, loading, onRefresh, onError }: Props) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [editing, setEditing] = useState<Category | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const nameVal = nombre.trim()
    const descVal = descripcion.trim()
    if (!nameVal || !descVal) return

    setSaving(true)
    onError(null)

    const payload = {
      nombre: nameVal,
      descripcion: descVal,
      activo
    }

    if (editing) {
      const { error } = await supabase
        .from('categoria')
        .update(payload)
        .eq('id_categoria', editing.id_categoria)

      setSaving(false)
      if (error) {
        onError(error.message)
        return
      }

      await logCatalogChange({
        tabla: 'categoria',
        operacion: 'UPDATE',
        id_registro: editing.id_categoria,
        datos_anteriores: editing,
        datos_nuevos: payload
      })
    } else {
      const { data, error } = await supabase
        .from('categoria')
        .insert(payload)
        .select('id_categoria')
        .single()

      setSaving(false)
      if (error) {
        onError(error.message)
        return
      }

      await logCatalogChange({
        tabla: 'categoria',
        operacion: 'INSERT',
        id_registro: data?.id_categoria ?? 0,
        datos_nuevos: payload
      })
    }

    resetForm()
    onRefresh()
  }

  function startEdit(cat: Category) {
    setEditing(cat)
    setNombre(cat.nombre)
    setDescripcion(cat.descripcion ?? '')
    setActivo(cat.activo ?? true)
  }

  function resetForm() {
    setEditing(null)
    setNombre('')
    setDescripcion('')
    setActivo(true)
  }

  async function toggleActivo(cat: Category) {
    const nuevoEstado = !cat.activo
    const { error } = await supabase
      .from('categoria')
      .update({ activo: nuevoEstado })
      .eq('id_categoria', cat.id_categoria)

    if (error) {
      onError(error.message)
    } else {
      await logCatalogChange({
        tabla: 'categoria',
        operacion: 'UPDATE',
        id_registro: cat.id_categoria,
        datos_anteriores: { activo: cat.activo },
        datos_nuevos: { activo: nuevoEstado }
      })
      onRefresh()
    }
  }

  return (
    <section className="panel master-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Subvista 1.1 – Categorías</h3>
          <p className="muted">Administra las agrupaciones y clasificaciones del catálogo.</p>
        </div>
      </div>

      <form className="category-form" onSubmit={handleSave} style={{ marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          <label>
            Nombre (obligatorio y único)
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. SUMINISTROS"
              required
            />
          </label>

          <label>
            Descripción (obligatoria)
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Insumos de empaque y embalaje"
              required
            />
          </label>
        </div>

        <label className="check" style={{ marginTop: '10px' }}>
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Categoría activa en el sistema
        </label>

        <div className="form-actions" style={{ marginTop: '14px' }}>
          <button className="button" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear categoría'}
          </button>
          {editing && (
            <button className="button secondary" type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <div style={{ marginTop: '28px' }}>
        <h4>Categorías registradas ({categories.length})</h4>
        {loading ? (
          <p className="muted">Cargando categorías…</p>
        ) : categories.length === 0 ? (
          <p className="empty-state">No hay categorías registradas.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id_categoria}>
                    <td><strong>{c.nombre}</strong></td>
                    <td>{c.descripcion || '—'}</td>
                    <td>
                      <span className={c.activo !== false ? 'category-pill' : 'category-pill muted'}>
                        {c.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-detail" type="button" onClick={() => startEdit(c)}>
                        Editar
                      </button>
                      <button
                        className="btn-detail"
                        style={{ marginLeft: '6px' }}
                        type="button"
                        onClick={() => void toggleActivo(c)}
                      >
                        {c.activo !== false ? 'Desactivar' : 'Activar'}
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
