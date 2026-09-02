import { useAuth } from './auth/AuthProvider'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  const { loading, user, profile, signOut } = useAuth()
  if (loading) return <main className="screen-message">Cargando sesión…</main>
  if (!user) return <LoginPage />
  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">IMPORTACIONES SHALOM</p><h1>Centro de operaciones</h1></div><div className="account"><div><strong>{profile?.nombre_completo ?? user.email}</strong><span>{profile?.roles.join(' · ') || 'Sin rol asignado'}</span></div><button className="button secondary" onClick={() => void signOut()}>Cerrar sesión</button></div></header><DashboardPage profile={profile} /></main>
}
