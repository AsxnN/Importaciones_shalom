import { useEffect, useState } from 'react'
import { canAccess, modules, type UserProfile } from '../lib/roles'
import { supabase } from '../lib/supabase'

type AttentionItem = {
  id: string
  module: string
  moduleCode: string
  description: string
  urgency: 'high' | 'medium'
  actionLabel: string
  onAction: () => void
}

type OverviewStats = {
  totalProducts: number
  totalWarehouses: number
  stockAttentionCount: number
  totalMovements: number
}

const moduleDescriptions: Record<string, { code: string; desc: string }> = {
  productos: {
    code: 'MOD-01',
    desc: 'Catálogo unificado de SKUs, reglas de empaque, camadas y proveedores.'
  },
  inventario: {
    code: 'MOD-02',
    desc: 'Control de stock físico en almacenes, paletizado, mermas y Kardex.'
  },
  movimientos: {
    code: 'MOD-03',
    desc: 'Transferencias entre áreas y salidas definitivas fuera de la empresa.'
  },
  recepciones: {
    code: 'MOD-04',
    desc: 'Recepción táctica y conciliación ciega con escaneo NFC/RFID en campo.'
  },
  auditorias: {
    code: 'MOD-05',
    desc: 'Conteo cíclico, auditorías periódicas e índice de exactitud ERI.'
  },
  ordenes: {
    code: 'MOD-06',
    desc: 'Planificación de compras, proyecciones de consumo y órdenes por producto.'
  },
  contenedores: {
    code: 'MOD-07',
    desc: 'Cubicaje de contenedores marítimos (20FT/40FT/LCL) y seguimiento logístico.'
  },
  usuarios: {
    code: 'MOD-08',
    desc: 'Administración de usuarios, seguridad RBAC y bitácora de auditoría.'
  }
}

export function DashboardPage({
  profile,
  onOpenProducts,
  onOpenInventory,
  onOpenMovements,
  onOpenReceptions,
  onOpenAudits,
  onOpenProjections,
  onOpenUsers
}: {
  profile: UserProfile | null
  onOpenProducts: () => void
  onOpenInventory: () => void
  onOpenMovements?: () => void
  onOpenReceptions?: () => void
  onOpenAudits?: () => void
  onOpenProjections?: () => void
  onOpenUsers?: () => void
}) {
  const [stats, setStats] = useState<OverviewStats>({
    totalProducts: 0,
    totalWarehouses: 0,
    stockAttentionCount: 0,
    totalMovements: 0
  })
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  const [loading, setLoading] = useState(true)

  const availableModules = modules.filter((module) =>
    canAccess(profile, module.permission, module.roles)
  )

  useEffect(() => {
    async function loadOverviewData() {
      setLoading(true)
      try {
        // 1. Contador de Productos
        const { count: prodCount } = await supabase
          .from('producto')
          .select('id_producto', { count: 'exact', head: true })

        // 2. Contador de Almacenes
        const { count: whCount } = await supabase
          .from('almacen')
          .select('id_almacen', { count: 'exact', head: true })
          .eq('activo', true)

        // 3. Stock en advertencia o alerta
        const { data: alertStock, count: alertCount } = await supabase
          .from('inventario')
          .select('id_inventario, stock_real, stock_minimo, estado_semaforo, producto(sku, nombre)', { count: 'exact' })
          .in('estado_semaforo', ['AMARILLO', 'ROJO'])
          .limit(5)

        // 4. Movimientos recientes
        const { count: movCount } = await supabase
          .from('movimiento_kardex')
          .select('id_movimiento', { count: 'exact', head: true })

        setStats({
          totalProducts: prodCount ?? 0,
          totalWarehouses: whCount ?? 0,
          stockAttentionCount: alertCount ?? 0,
          totalMovements: movCount ?? 0
        })

        // Construcción de items de atención requerida
        const items: AttentionItem[] = []
        if (alertStock && alertStock.length > 0) {
          for (const item of alertStock) {
            const prod = item.producto as unknown as { sku: string; nombre: string } | null
            const isRed = item.estado_semaforo === 'ROJO'
            items.push({
              id: `stock-${item.id_inventario}`,
              module: 'Inventario y almacenes',
              moduleCode: 'MOD-02',
              description: `${prod ? `${prod.sku}: ${prod.nombre}` : 'Artículo'} — Stock actual (${item.stock_real}) inferior al mínimo (${item.stock_minimo}).`,
              urgency: isRed ? 'high' : 'medium',
              actionLabel: 'Revisar',
              onAction: onOpenInventory
            })
          }
        }

        setAttentionItems(items)
      } catch {
        // En caso de modo offline o tablas no inicializadas
      } finally {
        setLoading(false)
      }
    }

    void loadOverviewData()
  }, [onOpenInventory])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Título de la vista y descripción corta (skill_design.md) */}
      <div className="page-heading">
        <div>
          <h1 className="page-title">Centro de operaciones</h1>
          <p className="page-lead">
            Resumen operativo transversal, atención requerida y acceso a módulos del sistema.
          </p>
        </div>
      </div>

      {profile === null && (
        <p className="notice" role="alert">
          Tu cuenta está autenticada, pero aún no tiene roles asignados. Contacta al administrador para habilitar módulos adicionales.
        </p>
      )}

      {/* Indicadores Clave en Tira Horizontal (skill_design.md - Key Indicators) */}
      <section className="indicator-strip" aria-label="Indicadores clave de rendimiento">
        <button
          type="button"
          className="indicator-card"
          onClick={onOpenProducts}
          title="Ver catálogo de productos"
        >
          <span className="indicator-label">Productos registrados</span>
          <span className="indicator-value">
            {loading ? '—' : stats.totalProducts}
          </span>
          <span className="indicator-context">Catálogo maestro activo</span>
        </button>

        <button
          type="button"
          className="indicator-card"
          onClick={onOpenInventory}
          title="Ver almacenes operativos"
        >
          <span className="indicator-label">Almacenes operativos</span>
          <span className="indicator-value">
            {loading ? '—' : stats.totalWarehouses}
          </span>
          <span className="indicator-context">Locaciones configuradas</span>
        </button>

        <button
          type="button"
          className={`indicator-card ${stats.stockAttentionCount > 0 ? 'attention' : ''}`}
          onClick={onOpenInventory}
          title="Ver artículos con atención de stock"
        >
          <span className="indicator-label">Atención de stock</span>
          <span className="indicator-value">
            {loading ? '—' : stats.stockAttentionCount}
          </span>
          <span className="indicator-context">
            {stats.stockAttentionCount > 0 ? 'Bajo o quiebre de stock' : 'Stock en niveles óptimos'}
          </span>
        </button>

        <button
          type="button"
          className="indicator-card"
          onClick={onOpenInventory}
          title="Ver movimientos de inventario"
        >
          <span className="indicator-label">Movimientos registrados</span>
          <span className="indicator-value">
            {loading ? '—' : stats.totalMovements}
          </span>
          <span className="indicator-context">Trazabilidad en Kardex</span>
        </button>
      </section>

      {/* Distribución: Panel de Atención Requerida y Resúmenes de Módulos */}
      <div className="overview-split-layout">
        {/* Panel Izquierdo: Atención Requerida (skill_design.md) */}
        <section className="attention-panel" aria-label="Atención requerida">
          <div className="attention-panel-header">
            <h2 className="section-title" style={{ margin: 0 }}>Atención requerida</h2>
            <span className="indicator-label">
              {attentionItems.length} {attentionItems.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          </div>

          {attentionItems.length === 0 ? (
            <div className="empty-attention">
              <p style={{ margin: 0 }}>No hay tareas pendientes para hoy.</p>
            </div>
          ) : (
            <div className="attention-list">
              {attentionItems.map((item) => (
                <div key={item.id} className="attention-item">
                  <div className="attention-item-content">
                    <span className="attention-item-module">
                      {item.moduleCode} — {item.module}
                    </span>
                    <span className="attention-item-desc">{item.description}</span>
                  </div>
                  <div className="attention-item-action">
                    <button
                      type="button"
                      className="button secondary button-sm"
                      onClick={item.onAction}
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Panel Derecho: Estado Operativo y Tareas Rápidas */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Resumen del sistema</h2>
          <p className="muted" style={{ margin: 0 }}>
            Control de inventarios y logística centralizada de importaciones.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="muted">Sesión actual</span>
              <strong style={{ fontSize: '13px' }}>{profile?.nombre_completo ?? 'Usuario'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="muted">Rol operativo</span>
              <span style={{ fontSize: '13px' }}>{profile?.roles?.join(', ') || 'Operador'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="muted">Sincronización</span>
              <span style={{ fontSize: '13px', color: 'var(--color-success)', fontWeight: 500 }}>En tiempo real</span>
            </div>
          </div>
        </section>
      </div>

      {/* Resúmenes de Módulos (skill_design.md - Module Summaries) */}
      <section aria-label="Módulos del sistema">
        <h2 className="section-title" style={{ marginBottom: '14px' }}>Módulos operativos</h2>
        <div className="module-summaries-grid">
          {availableModules.map((module) => {
            const meta = moduleDescriptions[module.key]
            const isReady =
              module.key === 'productos' ||
              module.key === 'inventario' ||
              module.key === 'movimientos' ||
              module.key === 'recepciones' ||
              module.key === 'auditorias' ||
              module.key === 'ordenes' ||
              module.key === 'usuarios'
            const onOpen =
              module.key === 'productos'
                ? onOpenProducts
                : module.key === 'inventario'
                ? onOpenInventory
                : module.key === 'movimientos'
                ? onOpenMovements
                : module.key === 'recepciones'
                ? onOpenReceptions
                : module.key === 'auditorias'
                ? onOpenAudits
                : module.key === 'ordenes'
                ? onOpenProjections
                : module.key === 'usuarios'
                ? onOpenUsers
                : undefined

            return (
              <div key={module.key} className="module-summary-card">
                <div>
                  <div className="module-summary-header">
                    <span className="module-code-badge">{meta?.code ?? 'MOD'}</span>
                    {!isReady && (
                      <span className="indicator-label" style={{ fontSize: '11px' }}>
                        En desarrollo
                      </span>
                    )}
                  </div>
                  <h3 className="module-summary-title" style={{ marginTop: '10px' }}>
                    {module.name}
                  </h3>
                  <p className="module-summary-desc" style={{ marginTop: '6px' }}>
                    {isReady
                      ? (meta?.desc ?? 'Módulo operativo disponible.')
                      : 'Este módulo aún no está disponible.'}
                  </p>
                </div>

                <div className="module-summary-footer">
                  {isReady ? (
                    <button
                      type="button"
                      className="button secondary button-sm"
                      onClick={onOpen}
                    >
                      Abrir módulo
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: '12px' }}>
                      Próxima habilitación
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
