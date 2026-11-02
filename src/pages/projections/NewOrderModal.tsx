import { useEffect, useState } from 'react'
import type { ProjectionTemplate } from '../../types/projections'

interface SupplierOption {
  id_proveedor: number
  razon_social: string
}

interface NewOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    numero_orden: string
    descripcion: string
    id_plantilla: number
    id_proveedor: number | null
    tipo_contenedor: '20FT' | '40FT' | 'LCL'
  }) => Promise<void>
  templates: ProjectionTemplate[]
  existingOrderNumbers: string[]
  suppliers: SupplierOption[]
}

export function NewOrderModal({
  isOpen,
  onClose,
  onSubmit,
  templates,
  existingOrderNumbers,
  suppliers
}: NewOrderModalProps) {
  const [numeroOrden, setNumeroOrden] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idPlantilla, setIdPlantilla] = useState<number>(templates[0]?.id_plantilla || 1)
  const [idProveedor, setIdProveedor] = useState<string>('')
  const [tipoContenedor, setTipoContenedor] = useState<'40FT' | '20FT' | 'LCL'>('40FT')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Generar número correlativo sugerido ej. IMP-2026-004
  useEffect(() => {
    if (isOpen) {
      const year = new Date().getFullYear()
      let maxNum = 0
      for (const ord of existingOrderNumbers) {
        const match = ord.match(/(\d+)$/)
        if (match) {
          const n = parseInt(match[1], 10)
          if (n > maxNum) maxNum = n
        }
      }
      const nextNum = (maxNum + 1).toString().padStart(3, '0')
      setNumeroOrden(`IMP-${year}-${nextNum}`)
      setDescripcion(`Planificación y proyección de compras ${year}`)
      setIdPlantilla(templates[0]?.id_plantilla || 1)
      setTipoContenedor('40FT')
      setIdProveedor(suppliers.length > 0 ? String(suppliers[0].id_proveedor) : '')
      setErrorMsg(null)
    }
  }, [isOpen, existingOrderNumbers, templates, suppliers])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const cleanNum = numeroOrden.trim().toUpperCase()
    if (!cleanNum) {
      setErrorMsg('El número de orden es obligatorio.')
      return
    }

    if (existingOrderNumbers.map((n) => n.toUpperCase()).includes(cleanNum)) {
      setErrorMsg(`La orden "${cleanNum}" ya existe en el sistema. Elige otro número.`)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        numero_orden: cleanNum,
        descripcion: descripcion.trim(),
        id_plantilla: Number(idPlantilla),
        id_proveedor: idProveedor ? Number(idProveedor) : null,
        tipo_contenedor: tipoContenedor
      })
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al crear la orden de importación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card"
        style={{
          width: '560px',
          maxWidth: '95vw',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '24px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-brand)' }}>
              Módulo 06 · Nueva orden periódica
            </span>
            <h2 className="section-title" style={{ margin: '4px 0 0 0', fontSize: '20px', color: 'var(--color-brand-deep)' }}>
              Crear orden de importación y proyección
            </h2>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              Configura los datos base de la orden. Luego ingresarás a la matriz para calcular consumos, subir el Excel de salidas y confirmar la compra.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={isSubmitting}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: '#FDF2F0',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: '13px',
              marginBottom: '16px'
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Número de orden de importación *
            </label>
            <input
              type="text"
              className="field-input"
              value={numeroOrden}
              onChange={(e) => setNumeroOrden(e.target.value.toUpperCase())}
              placeholder="ej. IMP-2026-004"
              required
              disabled={isSubmitting}
              style={{ fontFamily: 'monospace', fontWeight: 600 }}
            />
          </div>

          <div>
            <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Descripción o período operativo
            </label>
            <input
              type="text"
              className="field-input"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="ej. Campaña Suministros Agencias Noviembre 2026"
              disabled={isSubmitting}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Plantilla / Unidad de negocio
              </label>
              <select
                className="field-input"
                value={idPlantilla}
                onChange={(e) => setIdPlantilla(Number(e.target.value))}
                disabled={isSubmitting}
              >
                {templates.map((t) => (
                  <option key={t.id_plantilla} value={t.id_plantilla}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Tipo de contenedor marítimo
              </label>
              <select
                className="field-input"
                value={tipoContenedor}
                onChange={(e) => setTipoContenedor(e.target.value as any)}
                disabled={isSubmitting}
              >
                <option value="40FT">40 pies (40FT · Capacidad estándar)</option>
                <option value="20FT">20 pies (20FT · Carga media)</option>
                <option value="LCL">Carga consolidada (LCL)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Proveedor sugerido
            </label>
            <select
              className="field-input"
              value={idProveedor}
              onChange={(e) => setIdProveedor(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Proveedor genérico / Por definir</option>
              {suppliers.map((s) => (
                <option key={s.id_proveedor} value={s.id_proveedor}>
                  {s.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              background: 'var(--color-canvas)',
              border: '1px solid var(--color-border)',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              marginTop: '4px'
            }}
          >
            <strong>Estado inicial:</strong> La orden se creará en estado <strong>Borrador</strong> para que puedas ajustar consumos, cargar el Excel de salidas y calcular la compra sugerida sin afectar el muelle de recepción.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creando orden...' : 'Crear orden y abrir matriz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
