import { canAccess, modules, type UserProfile } from '../lib/roles'

const moduleMeta: Record<string, { code: string; desc: string; icon: string }> = {
  productos: {
    code: 'MOD-01',
    desc: 'Catálogo de SKUs, especificaciones de empaque, dimensiones, cubicaje y proveedores.',
    icon: '📦'
  },
  inventario: {
    code: 'MOD-02',
    desc: 'Control de stock físico, ubicaciones en almacén, trazabilidad de movimientos y Kardex.',
    icon: '🏢'
  },
  ordenes: {
    code: 'MOD-03',
    desc: 'Seguimiento de compras internacionales, contenedores, arribos y listas de empaque.',
    icon: '🚢'
  },
  recepciones: {
    code: 'MOD-04',
    desc: 'Lectura masiva mediante pórticos y pistolas RFID, validación de estiba y control de puchos.',
    icon: '📡'
  },
  auditorias: {
    code: 'MOD-05',
    desc: 'Auditorías de campo con RFID, conciliación y cálculo de Exactitud de Registro (ERI).',
    icon: '🔍'
  },
  usuarios: {
    code: 'MOD-06',
    desc: 'Administración de usuarios, roles de seguridad (RBAC), auditoría y permisos de acceso.',
    icon: '🛡️'
  }
}

export function DashboardPage({
  profile,
  onOpenProducts,
  onOpenInventory
}: {
  profile: UserProfile | null
  onOpenProducts: () => void
  onOpenInventory: () => void
}) {
  const available = modules.filter((module) =>
    canAccess(profile, module.permission, module.roles)
  )

  return (
    <section className="dashboard">
      <div className="welcome">
        <h2>Panel de Control y Operaciones</h2>
        <p>
          Selecciona un módulo táctico autorizado para gestionar la logística e inventarios.
        </p>
      </div>

      {profile === null && (
        <p className="notice">
          Tu cuenta está autenticada, pero aún no tiene un perfil o rol activo en el sistema. Solicita la asignación a un administrador.
        </p>
      )}

      <div className="module-grid">
        {available.map((module) => {
          const meta = moduleMeta[module.key]
          const isReady = module.key === 'productos' || module.key === 'inventario'
          const handleClick =
            module.key === 'productos'
              ? onOpenProducts
              : module.key === 'inventario'
              ? onOpenInventory
              : undefined

          return (
            <button
              className="module-card"
              key={module.key}
              type="button"
              onClick={handleClick}
              style={{ cursor: isReady ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: isReady ? 'var(--spidey-red)' : 'var(--spidey-blue)',
                    background: isReady ? 'var(--spidey-red-subtle)' : 'rgba(0, 180, 216, 0.1)',
                    border: `1px solid ${isReady ? 'rgba(229, 37, 33, 0.4)' : 'rgba(0, 180, 216, 0.3)'}`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    margin: 0
                  }}
                >
                  {meta?.code ?? 'MOD'}
                </span>
                <span style={{ fontSize: '1.4rem', margin: 0, background: 'none', border: 0, padding: 0 }}>
                  {meta?.icon ?? '⚡'}
                </span>
              </div>

              <strong>{module.name}</strong>

              <p
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--spidey-text-muted)',
                  margin: '8px 0 16px',
                  lineHeight: 1.4
                }}
              >
                {meta?.desc ?? 'Módulo del sistema de inventario.'}
              </p>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isReady ? 'var(--spidey-red-subtle)' : 'rgba(255, 255, 255, 0.04)',
                  borderColor: isReady ? 'rgba(229, 37, 33, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  color: isReady ? '#ff6b6b' : 'var(--spidey-text-subtle)'
                }}
              >
                {isReady ? 'Ingresar al Módulo →' : 'Próximamente'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
