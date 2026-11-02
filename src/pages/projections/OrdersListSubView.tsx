import { useMemo, useState } from 'react'
import type { ProjectionOrder, ProjectionOrderStatus } from '../../types/projections'

interface OrdersListSubViewProps {
  orders: ProjectionOrder[]
  onSelectOrder: (order: ProjectionOrder) => void
  onCreateOrderClick: () => void
  onDeleteOrder: (id_orden: number) => Promise<void>
  onOpenReceptions?: () => void
  onBack: () => void
  loading: boolean
}

export function OrdersListSubView({
  orders,
  onSelectOrder,
  onCreateOrderClick,
  onDeleteOrder,
  onOpenReceptions,
  onBack,
  loading
}: OrdersListSubViewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODAS' | ProjectionOrderStatus>('TODAS')
  const [templateFilter, setTemplateFilter] = useState<string>('TODAS')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Resumen métrico (Overview industrial)
  const metrics = useMemo(() => {
    const total = orders.length
    const borrador = orders.filter((o) => o.estado === 'BORRADOR').length
    const transito = orders.filter((o) => o.estado === 'TRANSITO').length
    const recibida = orders.filter((o) => o.estado === 'RECIBIDA').length
    return { total, borrador, transito, recibida }
  }, [orders])

  // Filtrado reactivo de órdenes
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // Filtro de búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase()
        const matchNum = ord.numero_orden.toLowerCase().includes(term)
        const matchDesc = (ord.descripcion || '').toLowerCase().includes(term)
        const matchProv = (ord.proveedor?.razon_social || '').toLowerCase().includes(term)
        if (!matchNum && !matchDesc && !matchProv) return false
      }

      // Filtro de estado
      if (statusFilter !== 'TODAS' && ord.estado !== statusFilter) {
        return false
      }

      // Filtro de plantilla
      if (templateFilter !== 'TODAS') {
        const tId = Number(templateFilter)
        if (ord.id_plantilla !== tId) return false
      }

      return true
    })
  }, [orders, searchTerm, statusFilter, templateFilter])

  const handleDelete = async (e: React.MouseEvent, id_orden: number, num: string) => {
    e.stopPropagation()
    if (!window.confirm(`¿Estás seguro de eliminar el borrador de orden ${num}? Esta acción no se puede deshacer.`)) {
      return
    }
    setDeletingId(id_orden)
    try {
      await onDeleteOrder(id_orden)
    } finally {
      setDeletingId(null)
    }
  }

  const renderStatusBadge = (status: ProjectionOrderStatus) => {
    switch (status) {
      case 'BORRADOR':
        return (
          <span
            style={{
              background: 'var(--color-canvas)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Borrador (en cálculo)
          </span>
        )
      case 'TRANSITO':
        return (
          <span
            style={{
              background: '#FFF8EE',
              color: 'var(--color-warning)',
              border: '1px solid #F5D399',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            En tránsito marítimo
          </span>
        )
      case 'RECIBIDA':
        return (
          <span
            style={{
              background: '#EEF8F1',
              color: 'var(--color-success)',
              border: '1px solid #A3D8B3',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Recibida en almacén
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 1. Encabezado principal */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="button secondary button-sm"
              onClick={onBack}
              title="Volver al centro de operaciones"
            >
              Volver
            </button>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Módulo 06 · Planificación comercial e importaciones
            </span>
          </div>
          <h1 className="page-title" style={{ marginTop: '6px' }}>
            Órdenes y proyecciones de importación
          </h1>
          <p className="page-lead" style={{ marginTop: '2px' }}>
            Historial de pedidos periódicos, cálculo de abastecimiento a agencias y órdenes en tránsito.
          </p>
        </div>

        <div>
          <button type="button" className="button primary" onClick={onCreateOrderClick}>
            + Nueva orden / proyección
          </button>
        </div>
      </div>

      {/* 2. Tira de Indicadores Clave (Overview Strip) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px'
        }}
      >
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            borderRadius: '6px'
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block' }}>
            Total de órdenes
          </span>
          <strong style={{ fontSize: '26px', color: 'var(--color-brand-deep)' }}>
            {metrics.total}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
            historial registrado
          </span>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            borderRadius: '6px'
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block' }}>
            En proyección (Borrador)
          </span>
          <strong style={{ fontSize: '26px', color: 'var(--color-text-primary)' }}>
            {metrics.borrador}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
            en simulación de matriz
          </span>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            borderRadius: '6px'
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block' }}>
            En tránsito marítimo
          </span>
          <strong style={{ fontSize: '26px', color: 'var(--color-warning)' }}>
            {metrics.transito}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
            esperando recepción en muelle
          </span>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            borderRadius: '6px'
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block' }}>
            Recibidas en muelle
          </span>
          <strong style={{ fontSize: '26px', color: 'var(--color-success)' }}>
            {metrics.recibida}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>
            completadas y conciliadas
          </span>
        </div>
      </div>

      {/* 3. Barra de Búsqueda y Filtros */}
      <div
        className="panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 18px'
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '260px' }}>
          <input
            type="search"
            className="field-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por N° orden, descripción o proveedor..."
            style={{ maxWidth: '380px' }}
          />

          <select
            className="field-input"
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            style={{ maxWidth: '220px' }}
          >
            <option value="TODAS">Todas las categorías</option>
            <option value="1">Importaciones y Store</option>
            <option value="2">Construcción</option>
          </select>
        </div>

        {/* Pestañas de estado en sentence case */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['TODAS', 'BORRADOR', 'TRANSITO', 'RECIBIDA'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`button button-sm ${statusFilter === st ? 'primary' : 'secondary'}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'TODAS'
                ? 'Todas las órdenes'
                : st === 'BORRADOR'
                ? 'Borradores'
                : st === 'TRANSITO'
                ? 'En tránsito'
                : 'Recibidas'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Tabla de Órdenes Guardadas */}
      <div className="table-wrap" style={{ margin: 0 }}>
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Cargando historial de órdenes y proyecciones...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-attention" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '15px', color: 'var(--color-text-primary)' }}>
              No se encontraron órdenes registradas con los filtros seleccionados.
            </p>
            <p className="muted" style={{ margin: '6px 0 16px 0', fontSize: '13px' }}>
              Crea una nueva orden de importación para iniciar la planificación periódica de abastecimiento.
            </p>
            <button type="button" className="button primary" onClick={onCreateOrderClick}>
              + Crear orden de importación
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° orden</th>
                <th>Fecha de emisión</th>
                <th>Descripción / período</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th>Contenedor</th>
                <th>Ítems proyectados</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((ord) => {
                const isDraft = ord.estado === 'BORRADOR'
                return (
                  <tr
                    key={ord.id_orden}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectOrder(ord)}
                    title="Haz clic para abrir la matriz de cálculo de esta orden"
                  >
                    <td>
                      <strong style={{ color: 'var(--color-brand-deep)', fontFamily: 'monospace', fontSize: '14px' }}>
                        {ord.numero_orden}
                      </strong>
                    </td>
                    <td>{ord.fecha_emision}</td>
                    <td>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {ord.descripcion || 'Sin descripción'}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          background: 'var(--color-canvas)',
                          border: '1px solid var(--color-border)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      >
                        {ord.id_plantilla === 2 ? 'Construcción' : 'Importaciones y Store'}
                      </span>
                    </td>
                    <td>{ord.proveedor?.razon_social || ord.proveedor?.nombre || 'Proveedor por definir'}</td>
                    <td>
                      <span
                        style={{
                          background: 'var(--color-brand-soft)',
                          color: 'var(--color-brand-deep)',
                          border: '1px solid var(--color-border)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        {ord.tipo_contenedor || '40FT'}
                      </span>
                    </td>
                    <td>
                      <strong>{ord.total_items || (ord.detalles?.length ?? 0)}</strong> productos
                      {ord.total_unidades ? (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: '4px' }}>
                          ({ord.total_unidades.toLocaleString('es-PE')} unid)
                        </span>
                      ) : null}
                    </td>
                    <td>{renderStatusBadge(ord.estado)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div
                        style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="button primary button-sm"
                          onClick={() => onSelectOrder(ord)}
                          title="Abrir la matriz tipo Excel para ver o modificar fórmulas y consumos"
                        >
                          Abrir matriz
                        </button>

                        {isDraft ? (
                          <button
                            type="button"
                            className="button secondary button-sm"
                            style={{ color: 'var(--color-danger)' }}
                            onClick={(e) => handleDelete(e, ord.id_orden, ord.numero_orden)}
                            disabled={deletingId === ord.id_orden}
                            title="Eliminar borrador de orden"
                          >
                            {deletingId === ord.id_orden ? '...' : 'Eliminar'}
                          </button>
                        ) : onOpenReceptions ? (
                          <button
                            type="button"
                            className="button secondary button-sm"
                            onClick={onOpenReceptions}
                            title="Ver estado de recepción en muelle (Módulo 04)"
                          >
                            Recepción
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
