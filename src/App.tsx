import { useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { ProductsPage } from './pages/ProductsPage'

export default function App() {
  const { loading, user, profile, signOut } = useAuth()
  const [section, setSection] = useState<'dashboard' | 'productos' | 'inventario'>('dashboard')

  if (loading) return <main className="screen-message">Cargando sesión…</main>
  if (!user) return <LoginPage />

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            <span style={{ marginRight: '6px' }}>🕸️</span>
            IMPORTACIONES SHALOM · SISTEMA TÁCTICO RFID
          </p>
          <h1>Centro de Operaciones</h1>
        </div>
        <div className="account">
          <div>
            <strong>{profile?.nombre_completo ?? user.email}</strong>
            <span>{profile?.roles.join(' · ') || 'Sin rol asignado'}</span>
          </div>
          <button className="button secondary" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {section === 'productos' ? (
        <ProductsPage onBack={() => setSection('dashboard')} />
      ) : section === 'inventario' ? (
        <InventoryPage onBack={() => setSection('dashboard')} />
      ) : (
        <DashboardPage
          profile={profile}
          onOpenProducts={() => setSection('productos')}
          onOpenInventory={() => setSection('inventario')}
        />
      )}
    </main>
  )
}

