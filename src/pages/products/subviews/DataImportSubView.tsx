import { useState, type ChangeEvent } from 'react'
import { logCatalogChange } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'

type ImportTarget = 'categoria' | 'producto' | 'proveedor' | 'regla_empaque'

type Props = {
  onRefreshAll: () => void
  onError: (msg: string | null) => void
}

const templates: Record<ImportTarget, { headers: string; example: string }> = {
  categoria: {
    headers: 'nombre,descripcion',
    example: 'EMBALAJE,Materiales de protección y embalaje\nFERRETERIA,Herramientas y accesorios de ferretería'
  },
  producto: {
    headers: 'sku,nombre,unidad_medida,peso_unitario_kg,costo_unitario,clasificacion_abc',
    example: 'SKU-001,Cinta de Embalaje 2x100m,ROLLO,0.25,2.50,A\nSKU-002,Film Stretch Transparente,ROLLO,1.50,8.20,B\nSKU-003,Grapas Industriales 5000u,CAJA,0.60,4.10,C'
  },
  proveedor: {
    headers: 'razon_social,calificacion_otif,tiempo_lead_time_dias',
    example: 'Proveedor Internacional Asia S.A.,96.5,35\nDistribuidora Nacional Shalom SAC,88.0,15'
  },
  regla_empaque: {
    headers: 'sku,unidades_por_caja,cajas_por_camita,camitas_por_paleta,volumen_caja_m3',
    example: 'SKU-001,36,8,5,0.0125\nSKU-002,6,10,4,0.0180'
  }
}

export function DataImportSubView({ onRefreshAll, onError }: Props) {
  const [target, setTarget] = useState<ImportTarget>('producto')
  const [rawText, setRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [importing, setImporting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  function parseCSV(text: string) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length < 2) {
      setParsedRows([])
      return
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? ''
      })
      return obj
    })

    setParsedRows(rows)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setRawText(content)
      parseCSV(content)
    }
    reader.readAsText(file)
  }

  function handleTextChange(text: string) {
    setRawText(text)
    parseCSV(text)
  }

  function loadExample() {
    const tmpl = templates[target]
    const fullText = `${tmpl.headers}\n${tmpl.example}`
    setRawText(fullText)
    parseCSV(fullText)
    setResultMessage(null)
  }

  async function handleImport() {
    if (parsedRows.length === 0) {
      onError('No hay filas válidas para importar.')
      return
    }

    setImporting(true)
    onError(null)
    setResultMessage(null)

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    try {
      if (target === 'categoria') {
        for (const row of parsedRows) {
          if (!row.nombre) continue
          const { error } = await supabase.from('categoria').insert({
            nombre: row.nombre.trim(),
            descripcion: row.descripcion?.trim() || null,
            activo: true
          })
          if (error) {
            errorCount++
            errors.push(`${row.nombre}: ${error.message}`)
          } else {
            successCount++
          }
        }
      } else if (target === 'producto') {
        for (const row of parsedRows) {
          if (!row.sku || !row.nombre) continue
          const { error } = await supabase.from('producto').insert({
            sku: row.sku.trim(),
            nombre: row.nombre.trim(),
            descripcion: row.nombre.trim(),
            unidad_medida: row.unidad_medida?.trim() || 'UNIDAD',
            peso_unitario_kg: row.peso_unitario_kg ? Number(row.peso_unitario_kg) : null,
            costo_unitario: row.costo_unitario ? Number(row.costo_unitario) : null,
            clasificacion_abc: row.clasificacion_abc?.trim() || 'B',
            activo: true
          })
          if (error) {
            errorCount++
            errors.push(`${row.sku}: ${error.message}`)
          } else {
            successCount++
          }
        }
      } else if (target === 'proveedor') {
        for (const row of parsedRows) {
          if (!row.razon_social) continue
          const { error } = await supabase.from('proveedor').insert({
            razon_social: row.razon_social.trim(),
            calificacion_otif: row.calificacion_otif ? Number(row.calificacion_otif) : null,
            tiempo_lead_time_dias: row.tiempo_lead_time_dias ? Number(row.tiempo_lead_time_dias) : 30,
            activo: true
          })
          if (error) {
            errorCount++
            errors.push(`${row.razon_social}: ${error.message}`)
          } else {
            successCount++
          }
        }
      } else if (target === 'regla_empaque') {
        for (const row of parsedRows) {
          if (!row.sku) continue
          // Buscar id_producto por sku
          const { data: prod } = await supabase
            .from('producto')
            .select('id_producto')
            .eq('sku', row.sku.trim())
            .single()

          if (!prod) {
            errorCount++
            errors.push(`SKU ${row.sku} no existe en catálogo de productos.`)
            continue
          }

          const uCaja = Math.max(1, Number(row.unidades_por_caja) || 1)
          const cCamita = Math.max(1, Number(row.cajas_por_camita) || 1)
          const nCamita = Math.max(1, Number(row.camitas_por_paleta) || 1)
          const vCaja = row.volumen_caja_m3 ? Number(row.volumen_caja_m3) : null
          const vTot = vCaja ? vCaja * (cCamita * nCamita) : null

          const { error } = await supabase.from('regla_empaque').upsert(
            {
              id_producto: prod.id_producto,
              unidades_por_caja: uCaja,
              cajas_por_camita: cCamita,
              camitas_por_paleta: nCamita,
              cajas_por_camada: cCamita,
              numero_camadas: nCamita,
              volumen_caja_m3: vCaja,
              volumen_total_m3: vTot,
              permite_puchos: true
            },
            { onConflict: 'id_producto' }
          )

          if (error) {
            errorCount++
            errors.push(`${row.sku}: ${error.message}`)
          } else {
            successCount++
          }
        }
      }

      await logCatalogChange({
        tabla: target,
        operacion: 'INSERT',
        id_registro: `IMPORT_${Date.now()}`,
        datos_nuevos: { exitosos: successCount, errores: errorCount }
      })

      setResultMessage(
        `Importación finalizada: ${successCount} registros importados exitosamente.${
          errorCount > 0 ? ` (${errorCount} con error)` : ''
        }`
      )
      if (errors.length > 0) {
        onError(errors.slice(0, 3).join(' | '))
      }

      onRefreshAll()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error inesperado durante la importación.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="panel master-section">
      <h3>Subvista 1.6 – Importación de datos (CSV / Excel)</h3>
      <p className="muted">
        Carga masiva para poblar rápidamente los catálogos maestros mediante archivos delimitados por comas (CSV).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '16px' }}>
        <label>
          <strong>Catálogo de destino:</strong>
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as ImportTarget)
              setParsedRows([])
              setRawText('')
              setResultMessage(null)
            }}
          >
            <option value="categoria">Categorías (Subvista 1.1)</option>
            <option value="producto">Productos (Subvista 1.2)</option>
            <option value="proveedor">Proveedores (Subvista 1.3)</option>
            <option value="regla_empaque">Reglas de Empaque (Subvista 1.4)</option>
          </select>
        </label>

        <label>
          <strong>Subir archivo (.csv):</strong>
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </label>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="button secondary" type="button" onClick={loadExample}>
            Cargar plantilla de ejemplo
          </button>
        </div>
      </div>

      <label style={{ display: 'grid', gap: '6px', marginTop: '16px', fontWeight: 700, fontSize: '0.85rem' }}>
        Datos en texto plano CSV (puedes pegar datos directamente aquí):
        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`Encabezados requeridos: ${templates[target].headers}\nEjemplo:\n${templates[target].example}`}
          style={{ fontFamily: 'monospace', fontSize: '0.83rem', border: '1px solid #b9c9bc', borderRadius: '8px', padding: '10px' }}
        />
      </label>

      {resultMessage && (
        <div className="notice" style={{ marginTop: '14px', background: '#edf7ef', borderColor: '#badfc4', color: '#17653f' }}>
          ✓ {resultMessage}
        </div>
      )}

      {parsedRows.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4>Vista previa de filas a importar ({parsedRows.length} registros detectados)</h4>
            <button className="button" disabled={importing} onClick={() => void handleImport()}>
              {importing ? 'Importando en base de datos…' : `Validar e Importar (${parsedRows.length} filas)`}
            </button>
          </div>

          <div className="table-wrap" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(parsedRows[0] || {}).map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 10).map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).map((val, colIdx) => (
                      <td key={colIdx}>{val || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 10 && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
              Mostrando las primeras 10 filas de {parsedRows.length} detectadas.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
