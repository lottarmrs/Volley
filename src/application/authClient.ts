import type { Session } from '@supabase/supabase-js';
import type { AssuranceLevel } from './authSession';

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
