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
  enrollTotp(): Promise<MfaEnrollment>;
  verifyTotp(code: string): Promise<void>;
}

export interface MfaEnrollment { factorId: string; qrCode: string; secret: string }

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
    async enrollTotp() {
      const { data, error } = await auth.mfa.enroll({ factorType: 'totp' });
      fail(error);
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    async verifyTotp(code) {
      const factors = await auth.mfa.listFactors(); fail(factors.error);
      const factor = factors.data.totp.find((item) => item.status === 'verified');
      if (!factor) throw new Error('Nenhum fator TOTP verificado.');
      const challenge = await auth.mfa.challenge({ factorId: factor.id }); fail(challenge.error);
      const verified = await auth.mfa.verify({
        factorId: factor.id, challengeId: challenge.data.id, code,
      });
      fail(verified.error);
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
  enrollTotp: async () => { throw unavailable; },
  verifyTotp: async () => { throw unavailable; },
};

export const supabaseAuthClient = isSupabaseConfigured
  ? createAuthClient(supabase.auth)
  : unavailableAuthClient;
