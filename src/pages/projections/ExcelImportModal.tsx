import { useState, useRef } from 'react'
import { projectionService } from '../../services/projectionService'
import type { ExcelImportResult, ProjectionItem, ProjectionTemplate } from '../../types/projections'

interface ExcelImportModalProps {
  isOpen: boolean
  onClose: () => void
  template: ProjectionTemplate
  items: ProjectionItem[]
  onApply: (updatedItems: ProjectionItem[], detectedMonths: string[]) => void
}

export function ExcelImportModal({
  isOpen,
  onClose,
  template,
  items,
  onApply
}: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null)
  const [parsedItems, setParsedItems] = useState<ProjectionItem[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setErrorMsg(null)
    setImportResult(null)
    setParsedItems(null)
    setParsing(true)

    try {
      const res = await projectionService.parseMonthlyOutputsExcel(selectedFile, template, items)
      if (!res.success || !res.result || !res.updatedItems) {
        setErrorMsg(res.error || 'No se pudieron extraer datos del archivo Excel.')
      } else {
        setImportResult(res.result)
        setParsedItems(res.updatedItems)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado al leer el archivo Excel.')
    } finally {
      setParsing(false)
    }
  }

  const handleConfirmApply = () => {
    if (!parsedItems || !importResult) return
    onApply(parsedItems, importResult.detectedMonths)
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card"
        style={{
          width: '740px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '24px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-brand)' }}>
              Módulo 06 · Consumos y demanda real
            </span>
            <h2 className="section-title" style={{ margin: '4px 0 0 0', fontSize: '20px', color: 'var(--color-brand-deep)' }}>
              Cargar salidas hacia agencias desde Excel
            </h2>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              Importa el reporte de despachos y salidas mensuales para actualizar los consumos históricos y recalcular el promedio de cada producto.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={parsing}>
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

        {/* Guía de Encabezados Requeridos en el Excel */}
        <div
          style={{
            background: 'var(--color-canvas)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '14px 16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-deep)' }}>
              Estructura requerida del archivo Excel:
            </span>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
            Para que el sistema extraiga correctamente las salidas, el archivo debe contener una fila de encabezados con las siguientes columnas:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '10px' }}>
            <div style={{ background: 'var(--color-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <strong style={{ fontSize: '12px', color: 'var(--color-brand)' }}>1. Fecha *</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Fecha del despacho (ej. 15/06/2026). Genera automáticamente los meses reales (ej. JUN a SET).
              </p>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <strong style={{ fontSize: '12px', color: 'var(--color-brand)' }}>2. Producto *</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Nombre del producto. Se busca coincidencia automática en el catálogo (insensible a mayúsculas o tildes).
              </p>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <strong style={{ fontSize: '12px', color: 'var(--color-brand)' }}>3. Cantidad *</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Número de unidades despachadas. Se acumularán automáticamente por mes para cada producto.
              </p>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <strong style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>4. Agencia (opcional)</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Sede destino (ej. Trujillo Central).
              </p>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', background: 'var(--color-brand-soft)', padding: '6px 10px', borderRadius: '4px' }}>
            <em>Nota: También se acepta el formato donde los meses vienen como columnas directas (ej. JUN, JUL, AGO, SET).</em>
          </div>
        </div>

        {/* Zona de Selección de Archivo */}
        <div
          style={{
            border: '2px dashed var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            background: 'var(--color-canvas)',
            cursor: 'pointer',
            marginBottom: '16px'
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-brand-deep)', marginBottom: '4px' }}>
            {file ? file.name : 'Haz clic para seleccionar o arrastra el archivo Excel (.xlsx, .xls, .csv)'}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            {file
              ? `Tamaño: ${(file.size / 1024).toFixed(1)} KB · Haz clic para cambiar de archivo`
              : 'Compatible con reportes de salidas mensuales de almacén o Kardex consolidado de agencias'}
          </p>
        </div>

        {parsing && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
            Procesando hojas y extrayendo consumos mensuales...
          </div>
        )}

        {/* Resumen del Análisis de Excel */}
        {importResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px'
              }}
            >
              <div
                style={{
                  background: 'var(--color-brand-soft)',
                  border: '1px solid var(--color-border)',
                  padding: '12px',
                  borderRadius: '6px'
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--color-brand-deep)', display: 'block' }}>
                  Productos coincidentes
                </span>
                <strong style={{ fontSize: '20px', color: 'var(--color-brand)' }}>
                  {importResult.matchedCount} de {items.length}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  vinculados automáticamente
                </span>
              </div>

              <div
                style={{
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border)',
                  padding: '12px',
                  borderRadius: '6px'
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  Meses identificados
                </span>
                <strong style={{ fontSize: '20px', color: 'var(--color-brand-deep)' }}>
                  {importResult.detectedMonths.length} meses
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  columnas de consumo
                </span>
              </div>

              <div
                style={{
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border)',
                  padding: '12px',
                  borderRadius: '6px'
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  Total filas leídas
                </span>
                <strong style={{ fontSize: '20px', color: 'var(--color-brand-deep)' }}>
                  {importResult.totalExcelRows}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
                  en la hoja procesada
                </span>
              </div>
            </div>

            {/* Badges de Meses Detectados */}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Meses detectados en las columnas del archivo:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                {importResult.detectedMonths.map((m) => (
                  <span
                    key={m}
                    style={{
                      background: 'var(--color-brand-soft)',
                      color: 'var(--color-brand-deep)',
                      border: '1px solid var(--color-border)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Vista Previa de Filas Parseadas */}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Vista previa de salidas leídas (primeros registros):
              </span>
              <div className="table-wrap" style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '6px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Producto en Excel</th>
                      <th>Estado catálogo</th>
                      {importResult.detectedMonths.slice(0, 5).map((m) => (
                        <th key={m} style={{ textAlign: 'right' }}>
                          {m}
                        </th>
                      ))}
                      {importResult.detectedMonths.length > 5 && <th>...</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.previewRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{row.producto}</strong>
                        </td>
                        <td>
                          {row.coincide ? (
                            <span
                              style={{
                                color: 'var(--color-success)',
                                fontWeight: 600,
                                fontSize: '12px'
                              }}
                            >
                              Coincide
                            </span>
                          ) : (
                            <span
                              style={{
                                color: 'var(--color-warning)',
                                fontWeight: 600,
                                fontSize: '12px'
                              }}
                            >
                              No en matriz
                            </span>
                          )}
                        </td>
                        {importResult.detectedMonths.slice(0, 5).map((m) => {
                          const val = row.valoresMeses[m]
                          return (
                            <td key={m} style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {val !== undefined ? Math.abs(val).toLocaleString('es-PE') : '-'}
                            </td>
                          )
                        })}
                        {importResult.detectedMonths.length > 5 && <td style={{ color: 'var(--color-text-secondary)' }}>...</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'var(--color-brand-soft)',
                border: '1px solid var(--color-border)',
                fontSize: '13px',
                color: 'var(--color-brand-deep)'
              }}
            >
              Al confirmar, los consumos mensuales se incorporarán a la matriz de esta orden y el promedio de cada mes se recalculará automáticamente según las salidas hacia agencias.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button type="button" className="button secondary" onClick={onClose} disabled={parsing}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleConfirmApply}
            disabled={!parsedItems || parsing}
          >
            Aplicar salidas a la matriz
          </button>
        </div>
      </div>
    </div>
  )
}
