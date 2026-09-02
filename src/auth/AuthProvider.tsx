import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { User } from '@supabase/supabase-js'
import { type UserProfile } from '../lib/roles'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
type AuthContextValue = { user: User | null; profile: UserProfile | null; loading: boolean; signIn: (email: string, password: string) => Promise<string | null>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | undefined>(undefined)
async function loadProfile(expectedUserId: string): Promise<UserProfile | null> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  console.log('[auth] Sesión al consultar perfil:', session, sessionError)

  if (sessionError || !session || session.user.id !== expectedUserId) {
    console.warn('[auth] No se consulta el perfil porque no hay una sesión válida para el usuario autenticado.', sessionError)
    return null
  }

  const { data, error } = await supabase.rpc('mi_perfil_acceso')
  console.log('[auth] Resultado de mi_perfil_acceso:', { data, error })
  return error || !data?.[0] ? null : data[0] as UserProfile
}
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null); const [profile, setProfile] = useState<UserProfile | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (!isSupabaseConfigured) { setLoading(false); return }; void supabase.auth.getUser().then(async ({ data, error }) => { console.log('[auth] Usuario recuperado al iniciar:', { user: data.user, error }); setUser(data.user); setProfile(data.user ? await loadProfile(data.user.id) : null); setLoading(false) }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); void (session?.user ? loadProfile(session.user.id).then(setProfile) : Promise.resolve(setProfile(null))) }); return () => listener.subscription.unsubscribe() }, [])
  const value = useMemo<AuthContextValue>(() => ({ user, profile, loading, async signIn(email, password) { if (!isSupabaseConfigured) return 'Configura las variables de Supabase antes de iniciar sesión.'; const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) return error.message; const { data: { session }, error: sessionError } = await supabase.auth.getSession(); console.log('[auth] Sesión después del inicio de sesión:', session, sessionError); return sessionError?.message ?? (session && data.user ? null : 'No se pudo establecer una sesión autenticada.'); }, async signOut() { await supabase.auth.signOut() } }), [user, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider'); return context }
