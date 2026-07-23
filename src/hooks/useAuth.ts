import { useAuthSession } from '../app/auth/useAuthSession';
import { supabaseAuthClient } from '../infra/supabase/authClient';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export function useAuth() {
  const auth = useAuthSession();
  const user = auth.session?.user ?? null;
  const profile = auth.account?.profile ?? null;
  const role = profile?.role ?? 'user';
  return {
    state: auth.state,
    user,
    profile,
    loading: auth.state.kind === 'initializing',
    signIn: supabaseAuthClient.signIn,
    signUp: (email: string, password: string, name?: string) =>
      supabaseAuthClient.signUp(email, password, name ?? '', ''),
    signOut: auth.signOut,
    refreshProfile: auth.retry,
    isSupabaseConfigured,
    // Papéis GLOBAIS (profiles.role): 'master' | 'programmer' | 'user'
    isMaster: role === 'master',
    isProgrammer: role === 'programmer',
    // staff = acesso de suporte (leitura ampliada); master = bypass total
    isStaff: role === 'master' || role === 'programmer',
    // Compat: isAdmin agora significa superadmin (master). Nunca dar bypass de
    // escrita ao programmer no frontend, senão a fila de sync volta a travar.
    isAdmin: role === 'master',
  };
}
