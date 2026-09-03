import { type FormEvent, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
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
      <form className="login-card" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '6px' }}>🕸️</div>
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            IMPORTACIONES SHALOM
          </p>
          <h1 style={{ fontSize: '1.85rem', textAlign: 'center', margin: '4px 0 8px' }}>
            Acceso Táctico
          </h1>
          <p className="muted" style={{ textAlign: 'center', fontSize: '0.88rem', margin: 0 }}>
            Autenticación de seguridad para gestión de almacén e inventario RFID.
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
          {sending ? 'Autenticando…' : 'Iniciar Sesión'}
        </button>
      </form>
    </main>
  )
}
