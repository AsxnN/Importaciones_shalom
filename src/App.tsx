import { useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { ThemeToggle } from './lib/ThemeToggle'
import { canAccess } from './lib/roles'
import { AuditsPage } from './pages/AuditsPage'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { MovementsPage } from './pages/MovementsPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProjectionsPage } from './pages/ProjectionsPage'
import { ReceptionsPage } from './pages/ReceptionsPage'
import { UsersPage } from './pages/UsersPage'

export default function App() {
  const { loading, user, profile, signOut } = useAuth()
  const [section, setSection] = useState<'dashboard' | 'productos' | 'inventario' | 'movimientos' | 'recepciones' | 'auditorias' | 'ordenes' | 'usuarios'>('dashboard')

  if (loading) return <main className="screen-message">Cargando sesión…</main>
  if (!user) return <LoginPage />

  const breadcrumbText =
    section === 'productos'
      ? 'Maestros y empaque'
      : section === 'inventario'
      ? 'Inventario y almacenes'
      : section === 'movimientos'
      ? 'Movimientos y transferencias'
      : section === 'recepciones'
      ? 'Recepciones RFID'
      : section === 'auditorias'
      ? 'Auditorías RFID (ERI)'
      : section === 'ordenes'
      ? 'Órdenes y proyecciones'
      : section === 'usuarios'
      ? 'Usuarios y permisos'
      : 'Resumen operativo'

  return (
    <div className="app-layout">
      {/* Barra Lateral Fija de 220 px (skill_design.md) */}
      <aside className="app-sidebar" aria-label="Navegación principal">
        <div>
          <div className="sidebar-header">
            <h1 className="sidebar-brand-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
              SHALOM
            </h1>
            <span className="sidebar-brand-subtitle">Centro de operaciones</span>
          </div>

          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'dashboard' ? 'active' : ''}`}
              onClick={() => setSection('dashboard')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Resumen</span>
            </button>

            <span className="sidebar-group-label">Módulos operativos</span>

            <button
              type="button"
              className={`sidebar-nav-item ${section === 'productos' ? 'active' : ''}`}
              onClick={() => setSection('productos')}
            >
              <span className="sidebar-nav-code">01</span>
              <span>Maestros y empaque</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${section === 'inventario' ? 'active' : ''}`}
              onClick={() => setSection('inventario')}
            >
              <span className="sidebar-nav-code">02</span>
              <span>Inventario y almacenes</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${section === 'movimientos' ? 'active' : ''}`}
              onClick={() => setSection('movimientos')}
            >
              <span className="sidebar-nav-code">03</span>
              <span>Movimientos y transferencias</span>
            </button>

            {canAccess(profile, 'RECEPCIONES.VER', ['ADMINISTRADOR', 'OPERARIO', 'AUDITOR']) && (
              <button
                type="button"
                className={`sidebar-nav-item ${section === 'recepciones' ? 'active' : ''}`}
                onClick={() => setSection('recepciones')}
              >
                <span className="sidebar-nav-code">04</span>
                <span>Recepciones RFID</span>
              </button>
            )}

            {/* Módulo 05: Auditorías RFID (ERI) */}
            {canAccess(profile, 'AUDITORIAS.VER', ['ADMINISTRADOR', 'AUDITOR']) && (
              <button
                type="button"
                className={`sidebar-nav-item ${section === 'auditorias' ? 'active' : ''}`}
                onClick={() => setSection('auditorias')}
              >
                <span className="sidebar-nav-code">05</span>
                <span>Auditorías RFID (ERI)</span>
              </button>
            )}

            {canAccess(profile, 'ORDENES.VER', ['ADMINISTRADOR', 'COMPRADOR']) && (
              <button
                type="button"
                className={`sidebar-nav-item ${section === 'ordenes' ? 'active' : ''}`}
                onClick={() => setSection('ordenes')}
                title="Planificación de compras y proyecciones dinámicas de importación"
              >
                <span className="sidebar-nav-code">06</span>
                <span>Órdenes y proyecciones</span>
              </button>
            )}

            <button
              type="button"
              className="sidebar-nav-item"
              disabled
              title="Control de cubicaje y seguimiento de contenedores"
            >
              <span className="sidebar-nav-code">07</span>
              <span>Control de contenedores</span>
              <span className="sidebar-nav-tag">Pronto</span>
            </button>

            {canAccess(profile, 'USUARIOS.VER', ['ADMINISTRADOR']) && (
              <button
                type="button"
                className={`sidebar-nav-item ${section === 'usuarios' ? 'active' : ''}`}
                onClick={() => setSection('usuarios')}
                title="Administración de usuarios, roles y permisos"
              >
                <span className="sidebar-nav-code">08</span>
                <span>Usuarios y permisos</span>
              </button>
            )}
          </nav>
        </div>

        {/* Información del Usuario y Cierre de Sesión */}
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <span className="sidebar-user-name" title={profile?.nombre_completo ?? user.email ?? ''}>
              {profile?.nombre_completo ?? user.email}
            </span>
            <span className="sidebar-user-role">
              {profile?.roles?.length ? profile.roles.join(', ') : 'Sin rol asignado'}
            </span>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Espacio Central de Trabajo (skill_design.md) */}
      <div className="app-main">
        {/* Cabecera Superior: breadcrumb, selector de contexto, acciones */}
        <header className="app-header">
          <div className="breadcrumb-bar">
            <span>Inicio</span>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-active">{breadcrumbText}</span>
          </div>

          <div className="header-actions">
            <div className="operational-status-pill">
              <span className="status-dot" aria-hidden="true" />
              <span>Operativo en línea</span>
            </div>
            <ThemeToggle showLabel={false} />
          </div>
        </header>

        {/* Contenedor de la Vista Activa */}
        <main className="app-workspace">
          {section === 'productos' ? (
            <ProductsPage onBack={() => setSection('dashboard')} />
          ) : section === 'inventario' ? (
            <InventoryPage onBack={() => setSection('dashboard')} />
          ) : section === 'movimientos' ? (
            <MovementsPage onBack={() => setSection('dashboard')} />
          ) : section === 'recepciones' ? (
            <ReceptionsPage
              onBack={() => setSection('dashboard')}
              onNavigateToInventory={() => setSection('inventario')}
            />
          ) : section === 'auditorias' ? (
            <AuditsPage onBack={() => setSection('dashboard')} />
          ) : section === 'ordenes' ? (
            <ProjectionsPage
              onBack={() => setSection('dashboard')}
              onOpenReceptions={() => setSection('recepciones')}
            />
          ) : section === 'usuarios' ? (
            <UsersPage onBack={() => setSection('dashboard')} />
          ) : (
            <DashboardPage
              profile={profile}
              onOpenProducts={() => setSection('productos')}
              onOpenInventory={() => setSection('inventario')}
              onOpenMovements={() => setSection('movimientos')}
              onOpenReceptions={() => setSection('recepciones')}
              onOpenAudits={() => setSection('auditorias')}
              onOpenProjections={() => setSection('ordenes')}
              onOpenUsers={() => setSection('usuarios')}
            />
          )}
        </main>
      </div>
    </div>
  )
}
