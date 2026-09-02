import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { User } from '@supabase/supabase-js'
import { type UserProfile } from '../lib/roles'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
type AuthContextValue = { user: User | null; profile: UserProfile | null; loading: boolean; signIn: (email: string, password: string) => Promise<string | null>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | undefined>(undefined)
async function loadProfile(): Promise<UserProfile | null> { const { data, error } = await supabase.rpc('mi_perfil_acceso'); return error || !data?.[0] ? null : data[0] as UserProfile }
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null); const [profile, setProfile] = useState<UserProfile | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (!isSupabaseConfigured) { setLoading(false); return }; void supabase.auth.getUser().then(async ({ data }) => { setUser(data.user); setProfile(data.user ? await loadProfile() : null); setLoading(false) }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); void (session?.user ? loadProfile().then(setProfile) : Promise.resolve(setProfile(null))) }); return () => listener.subscription.unsubscribe() }, [])
  const value = useMemo<AuthContextValue>(() => ({ user, profile, loading, async signIn(email, password) { if (!isSupabaseConfigured) return 'Configura las variables de Supabase antes de iniciar sesión.'; const { error } = await supabase.auth.signInWithPassword({ email, password }); return error?.message ?? null }, async signOut() { await supabase.auth.signOut() } }), [user, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider'); return context }
