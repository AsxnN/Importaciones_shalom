import { useState, useEffect, useMemo } from 'react'
import { locationService } from '../../services/locationService'
import type { PalletRecord } from '../../types/locations'

interface PalletDecommissionSubViewProps {
  warehouseId: number
  warehouseName: string
  products: { id_producto: number; sku: string; nombre: string }[]
  warehouses?: { id_almacen: number; nombre: string; prefijo_rfid?: string | null; activo: boolean }[]
  initialFilterSku?: string
  openModalDirectly?: boolean
  onPalletDecommissioned?: () => void
}

export function PalletDecommissionSubView({
  warehouseId,
  warehouseName,
  products,
  initialFilterSku = '',
  onPalletDecommissioned
}: PalletDecommissionSubViewProps) {
  const [pallets, setPallets] = useState<PalletRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkuFilter, setSelectedSkuFilter] = useState(initialFilterSku)
  const [selectedLocationType, setSelectedLocationType] = useState<'ALL' | 'RACK' | 'CAMPO' | 'SIN_CELDA'>('ALL')

  // Cargar paletas del almacén
  const loadPallets = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await locationService.getWarehousePallets(warehouseId)
      setPallets(data)
    } catch (err: any) {
      setErrorMsg(`Error cargando paletas: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPallets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  useEffect(() => {
    if (initialFilterSku) {
      setSelectedSkuFilter(initialFilterSku)
    }
  }, [initialFilterSku])

  // Filtrado reactivo de paletas
  const filteredPallets = useMemo(() => {
    let result = pallets

    if (selectedSkuFilter) {
      result = result.filter((p) => p.producto?.sku === selectedSkuFilter)
    }

    if (selectedLocationType === 'RACK') {
      result = result.filter(
        (p) => p.tipo_ubicacion === 'RACK' || (p.codigo_ubicacion && !p.codigo_ubicacion.includes('CAMPO'))
      )
    } else if (selectedLocationType === 'CAMPO') {
      result = result.filter(
        (p) => p.tipo_ubicacion === 'CAMPO' || (p.codigo_ubicacion && p.codigo_ubicacion.includes('CAMPO'))
      )
    } else if (selectedLocationType === 'SIN_CELDA') {
      result = result.filter((p) => !p.id_celda && !p.codigo_ubicacion)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((p) => {
        const sku = p.producto?.sku?.toLowerCase() || ''
        const name = p.producto?.nombre?.toLowerCase() || ''
        const tag = p.uid_tag?.toLowerCase() || ''
        const barcode = p.codigo_barras?.toLowerCase() || ''
        const ubi = p.codigo_ubicacion?.toLowerCase() || ''
        return sku.includes(q) || name.includes(q) || tag.includes(q) || barcode.includes(q) || ubi.includes(q)
      })
    }

    return result
  }, [pallets, selectedSkuFilter, selectedLocationType, searchQuery])

  // Métricas rápidas
  const metrics = useMemo(() => {
    const total = pallets.length
    const enRacks = pallets.filter(
      (p) => p.tipo_ubicacion === 'RACK' || (p.codigo_ubicacion && !p.codigo_ubicacion.includes('CAMPO'))
    ).length
    const enCampo = pallets.filter(
      (p) => p.tipo_ubicacion === 'CAMPO' || (p.codigo_ubicacion && p.codigo_ubicacion.includes('CAMPO'))
    ).length
    const sinCelda = pallets.filter((p) => !p.id_celda && !p.codigo_ubicacion).length
    return { total, enRacks, enCampo, sinCelda }
  }, [pallets])

  // Liberar celda física de una paleta (la paleta queda sin celda en el almacén)
  const handleUnassignCell = async (palletId: number, codigo: string, cellId?: number) => {
    if (!window.confirm(`¿Liberar la ubicación física ${codigo}? La paleta permanecerá registrada en el almacén pero sin celda asignada.`)) {
      return
    }
    try {
      await locationService.unassignPallet(palletId, cellId, warehouseId)
      setSuccessMsg(`Ubicación ${codigo} liberada exitosamente.`)
      await loadPallets()
      onPalletDecommissioned?.()
    } catch (err: any) {
      setErrorMsg(`Error al liberar ubicación: ${err.message}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Alertas */}
      {errorMsg && (
        <div className="login-error-banner" role="alert" style={{ margin: 0 }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          style={{
            padding: '10px 16px',
            backgroundColor: 'var(--color-brand-soft)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-brand-deep)',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* Tira de Métricas de Paletas */}
      <div className="inventory-metric-strip">
        <div className="metric-box">
          <span className="metric-label">Paletas activas</span>
          <span className="metric-value">{metrics.total}</span>
          <span className="metric-subtext">En esta sede</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">En racks Drive-In</span>
          <span className="metric-value" style={{ color: 'var(--color-brand)' }}>
            {metrics.enRacks}
          </span>
          <span className="metric-subtext">En celdas de túnel</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">En zona de campo</span>
          <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
            {metrics.enCampo}
          </span>
          <span className="metric-subtext">Piso libre / sobredimensión</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Sin celda asignada</span>
          <span className="metric-value" style={{ color: 'var(--color-text-secondary)' }}>
            {metrics.sinCelda}
          </span>
          <span className="metric-subtext">Pendientes de ubicar</span>
        </div>
      </div>

      {/* Banner de Enlace Operativo a Módulo 03 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '14px 18px',
          borderRadius: '8px',
          backgroundColor: 'var(--color-brand-soft)',
          border: '1px solid var(--color-border)'
        }}
      >
        <span style={{ fontSize: '20px' }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: '14px', color: 'var(--color-brand-deep)' }}>
            Movimientos y salidas fuera de la empresa
          </strong>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Para transferir paletas hacia otra sede o realizar despachos definitivos (venta a clientes o bajas de paleta), ingresa al <strong>Módulo 03: Movimientos y Transferencias</strong>.
          </p>
        </div>
      </div>

      {/* Encabezado de la Vista */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-brand-deep)', margin: 0 }}>
            Paletas RFID registradas · {warehouseName}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            Supervisión y control de inventario físico paletizado con lectura RFID en tiempo real.
          </p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          backgroundColor: 'var(--color-surface)',
          padding: '14px 16px',
          borderRadius: '6px',
          border: '1px solid var(--color-border)'
        }}
      >
        {/* Buscador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0 10px', backgroundColor: 'var(--color-canvas)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por SKU, producto, Tag RFID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 0', fontSize: '13px', backgroundColor: 'transparent', color: 'var(--color-text-primary)' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '14px' }}
            >
              ×
            </button>
          )}
        </div>

        {/* Filtro por Producto */}
        <div>
          <select
            value={selectedSkuFilter}
            onChange={(e) => setSelectedSkuFilter(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '13px', backgroundColor: 'var(--color-canvas)' }}
          >
            <option value="">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id_producto} value={p.sku}>
                {p.sku} — {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por Tipo de Ubicación */}
        <div>
          <select
            value={selectedLocationType}
            onChange={(e) => setSelectedLocationType(e.target.value as any)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '13px', backgroundColor: 'var(--color-canvas)' }}
          >
            <option value="ALL">Todas las ubicaciones</option>
            <option value="RACK">En Racks Drive-In</option>
            <option value="CAMPO">En Zona de Campo</option>
            <option value="SIN_CELDA">Sin celda asignada</option>
          </select>
        </div>

        {/* Limpiar Filtros */}
        {(searchQuery || selectedSkuFilter || selectedLocationType !== 'ALL') && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className="action-button secondary"
              onClick={() => {
                setSearchQuery('')
                setSelectedSkuFilter('')
                setSelectedLocationType('ALL')
              }}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla de Paletas Activas */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Cargando inventario de paletas del almacén…
        </div>
      ) : filteredPallets.length === 0 ? (
        <div className="empty-state-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-brand-deep)' }}>
            No se encontraron paletas activas
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '480px', margin: '8px auto 0' }}>
            {pallets.length === 0
              ? 'No hay paletas físicas registradas en esta sede.'
              : 'Ninguna paleta coincide con los criterios de búsqueda y filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
          <table className="products-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tag RFID / UID</th>
                <th style={{ textAlign: 'left' }}>Código de barras / LPN</th>
                <th style={{ textAlign: 'left' }}>Producto</th>
                <th style={{ textAlign: 'center' }}>Tipo</th>
                <th style={{ textAlign: 'right' }}>Bultos</th>
                <th style={{ textAlign: 'left' }}>Ubicación física</th>
                <th style={{ textAlign: 'center', width: '140px' }}>Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {filteredPallets.map((p) => {
                const isCampo = p.tipo_ubicacion === 'CAMPO' || p.codigo_ubicacion?.includes('CAMPO')

                return (
                  <tr key={p.id_etiqueta}>
                    <td>
                      <code style={{ fontWeight: 600, color: 'var(--color-brand-deep)', fontSize: '13px' }}>
                        {p.uid_tag}
                      </code>
                    </td>
                    <td style={{ fontSize: '13px', color: p.codigo_barras ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {p.codigo_barras || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>
                          {p.producto?.sku || 'SKU'}
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          {p.producto?.nombre || 'Producto'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge ${p.tipo_paleta === 'COMPLETO' ? 'active' : 'inactive'}`}>
                        {p.tipo_paleta === 'COMPLETO' ? 'Paleta entera' : 'Pucho suelto'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {p.cantidad_paquetes}
                    </td>
                    <td>
                      {p.codigo_ubicacion ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: isCampo ? 'rgba(188, 121, 31, 0.12)' : 'var(--color-brand-soft)',
                            color: isCampo ? 'var(--color-warning)' : 'var(--color-brand-deep)'
                          }}
                        >
                          {p.codigo_ubicacion}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>
                          Sin celda asignada
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {p.id_celda ? (
                        <button
                          type="button"
                          className="action-button secondary"
                          onClick={() => handleUnassignCell(p.id_etiqueta, p.codigo_ubicacion || 'Ubicación', p.id_celda || undefined)}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          title="Liberar casilla física del rack (la paleta permanece en almacén)"
                        >
                          Liberar celda
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          Sin celda
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
