import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { AssuranceLevel } from '@app/authSession';

export interface AuthClient {
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string, username: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  linkGoogleIdentity(): Promise<void>;
  requestPasswordRecovery(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getAssuranceLevel(): Promise<AssuranceLevel>;
  signOut(): Promise<void>;
}

export function createAuthClient(
  auth: typeof supabase.auth,
  location: Pick<Location, 'origin'> = window.location,
): AuthClient {
  const fail = (error: { message: string } | null) => { if (error) throw error; };
  return {
    async getSession() {
      const { data, error } = await auth.getSession(); fail(error); return data.session;
    },
    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await auth.signInWithPassword({ email, password }); fail(error);
    },
    async signUp(email, password, name, username) {
      const { error } = await auth.signUp({
        email,
        password,
        options: { data: { name, username } },
      });
      fail(error);
    },
    async signInWithGoogle() {
      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      fail(error);
    },
    async linkGoogleIdentity() {
      const { error } = await auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      fail(error);
    },
    async requestPasswordRecovery(email) {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/recuperar-senha`,
      });
      fail(error);
    },
    async updatePassword(password) {
      const { error } = await auth.updateUser({ password }); fail(error);
    },
    async getAssuranceLevel() {
      const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel(); fail(error);
      return { current: data.currentLevel, next: data.nextLevel };
    },
    async signOut() {
      const { error } = await auth.signOut(); fail(error);
    },
  };
}

const unavailable = new Error('Supabase is not configured.');
const unavailableAuthClient: AuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => { throw unavailable; },
  signUp: async () => { throw unavailable; },
  signInWithGoogle: async () => { throw unavailable; },
  linkGoogleIdentity: async () => { throw unavailable; },
  requestPasswordRecovery: async () => { throw unavailable; },
  updatePassword: async () => { throw unavailable; },
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
};

export const supabaseAuthClient = isSupabaseConfigured
  ? createAuthClient(supabase.auth)
  : unavailableAuthClient;
