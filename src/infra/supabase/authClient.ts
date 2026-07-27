import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { AssuranceLevel } from '@app/authSession';

export interface AuthClient {
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signIn(email: string, password: string, captchaToken?: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    name: string,
    username: string,
    claimCode?: string,
    captchaToken?: string,
  ): Promise<void>;
  signInWithGoogle(): Promise<void>;
  linkGoogleIdentity(): Promise<void>;
  requestPasswordRecovery(email: string, captchaToken?: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getAssuranceLevel(): Promise<AssuranceLevel>;
  signOut(): Promise<void>;
  signOutOthers(): Promise<void>;
  enrollTotp(): Promise<MfaEnrollment>;
  verifyTotp(code: string, factorId?: string): Promise<void>;
}

export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function createAuthClient(
  auth: typeof supabase.auth,
  location: Pick<Location, 'origin'> = window.location,
): AuthClient {
  const fail = (error: { message: string } | null) => {
    if (error) throw error;
  };
  return {
    async getSession() {
      const { data, error } = await auth.getSession();
      fail(error);
      return data.session;
    },
    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password, captchaToken) {
      const { error } = await auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      fail(error);
    },
    async signUp(email, password, name, username, claimCode, captchaToken) {
      const { error } = await auth.signUp({
        email,
        password,
        options: { data: { name, username, claim_code: claimCode }, captchaToken },
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
    async requestPasswordRecovery(email, captchaToken) {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/recuperar-senha`,
        captchaToken,
      });
      fail(error);
    },
    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      fail(error);
    },
    async getAssuranceLevel() {
      const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
      fail(error);
      return { current: data.currentLevel, next: data.nextLevel };
    },
    async signOut() {
      const { error } = await auth.signOut();
      fail(error);
    },
    async signOutOthers() {
      const { error } = await auth.signOut({ scope: 'others' });
      fail(error);
    },
    async enrollTotp() {
      // O Supabase recusa um segundo fator TOTP com 422 ("A factor with the friendly
      // name ... already exists") enquanto existir um fator nao verificado — sobra de
      // uma configuracao que ninguem terminou. Com MFA obrigatorio esta tela e o unico
      // caminho para master/programmer/owner/admin, entao esse 422 trancaria a conta
      // fora do app. Um fator nao verificado nao protege nada, entao ele e descartado
      // e o enroll refeito. Fatores verificados nunca sao tocados.
      let { data, error } = await auth.mfa.enroll({ factorType: 'totp' });
      if (error) {
        const existing = await auth.mfa.listFactors();
        fail(existing.error);
        for (const factor of existing.data.all) {
          if (factor.factor_type === 'totp' && factor.status !== 'verified') {
            // Falha aqui e ignorada: a limpeza e idempotente e duas chamadas
            // concorrentes disputam o mesmo fator, entao a perdedora recebe
            // "Factor not found". Se a remocao falhar de verdade, o enroll abaixo
            // devolve o erro original e esse sim fica visivel.
            await auth.mfa.unenroll({ factorId: factor.id });
          }
        }
        ({ data, error } = await auth.mfa.enroll({ factorType: 'totp' }));
      }
      fail(error);
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    async verifyTotp(code, factorId) {
      let targetFactorId = factorId;
      if (!targetFactorId) {
        const factors = await auth.mfa.listFactors();
        fail(factors.error);
        const factor = factors.data.totp.find((item) => item.status === 'verified');
        if (!factor) throw new Error('Nenhum fator TOTP verificado.');
        targetFactorId = factor.id;
      }
      const challenge = await auth.mfa.challenge({ factorId: targetFactorId });
      fail(challenge.error);
      const verified = await auth.mfa.verify({
        factorId: targetFactorId,
        challengeId: challenge.data.id,
        code,
      });
      fail(verified.error);
    },
  };
}

const unavailable = new Error('Supabase is not configured.');
const unavailableAuthClient: AuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => {
    throw unavailable;
  },
  signUp: async () => {
    throw unavailable;
  },
  signInWithGoogle: async () => {
    throw unavailable;
  },
  linkGoogleIdentity: async () => {
    throw unavailable;
  },
  requestPasswordRecovery: async () => {
    throw unavailable;
  },
  updatePassword: async () => {
    throw unavailable;
  },
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
  signOutOthers: async () => {},
  enrollTotp: async () => {
    throw unavailable;
  },
  verifyTotp: async (_code: string, _factorId?: string) => {
    throw unavailable;
  },
};

export const supabaseAuthClient = isSupabaseConfigured
  ? createAuthClient(supabase.auth)
  : unavailableAuthClient;
