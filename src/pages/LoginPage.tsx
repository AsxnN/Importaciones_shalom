import { type FormEvent, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ThemeToggle } from '../lib/ThemeToggle'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError(null)
    setError(await signIn(email, password))
    setSending(false)
  }

  return (
    <main className="login-page">
      <div className="login-theme-bar">
        <ThemeToggle />
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-header">
          <div className="login-icon-wrap" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <span className="brand-tag">Shalom Logística</span>
          <h1>Ingreso al sistema</h1>
          <p className="login-subtitle">
            Control de inventarios, cubicaje de paletas y operaciones WMS.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <p className="notice">
            Falta configurar las variables de entorno en el archivo <code>.env</code>.
          </p>
        )}

        <label>
          Correo electrónico
          <input
            type="email"
            autoComplete="email"
            placeholder="usuario@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Contraseña de acceso
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button
          className="button"
          style={{ width: '100%', marginTop: '24px' }}
          disabled={sending || !isSupabaseConfigured}
        >
          {sending ? 'Autenticando…' : 'Iniciar sesión'}
        </button>
      </form>
    </main>
  )
}
