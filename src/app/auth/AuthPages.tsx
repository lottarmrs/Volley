import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  AlertCircle,
  Mail,
  User,
  Lock,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { AuthForm } from '../../components/account/AuthForm';
import type { MfaEnrollment } from '@app/authClient';
import { useAuthSession } from './useAuthSession';
import { resolveTransitionDestination, routeForAuthState } from './authRoutes';
import type { RouteLocation } from './authRoutes';
import { CaptchaField } from './CaptchaField';
import { captchaSiteKey } from './captchaEnv';
import { validatePasswordLength } from './passwordPolicy';
import { OtpInput } from '../../ui/OtpInput';
import { normalizeHandle, validateHandle } from '@logic/handle';
import { useHandleAvailability } from '@hooks/useHandleAvailability';

function destinationFromLocationState(state: unknown): string {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from ?? '/painel';
}

function TotpEnrollmentForm({
  enrollment,
  code,
  onCodeChange,
  onSubmit,
  error,
}: {
  enrollment: MfaEnrollment;
  code: string;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopySecret = () => {
    if (enrollment.secret) {
      navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="bg-white p-4 rounded-2xl shadow-md inline-block mx-auto border border-base-300">
        <img
          src={enrollment.qrCode}
          alt="QR code para configurar autenticacao em duas etapas"
          className="w-48 h-48 mx-auto object-contain"
        />
      </div>

      <div className="text-left space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/70">
          Código de Chave Manual:
        </p>
        <div className="flex items-center gap-2 bg-base-100 p-2.5 rounded-xl border border-base-300/80 font-mono text-xs font-bold text-base-content break-all">
          <span className="flex-1 select-all">{enrollment.secret}</span>
          <button
            type="button"
            onClick={handleCopySecret}
            className="btn btn-ghost btn-xs gap-1 text-xs text-primary hover:bg-primary/10 rounded-lg shrink-0"
            title="Copiar chave manual"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-success" /> Copiado!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copiar
              </>
            )}
          </button>
        </div>
      </div>

      <div className="form-control text-center">
        <label
          htmlFor="totp-code"
          className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1 justify-center"
        >
          Código de 6 dígitos
        </label>
        <OtpInput id="totp-code" value={code} onChange={onCodeChange} length={6} />
      </div>

      {error && (
        <div
          className="alert alert-error alert-soft text-xs flex items-center gap-2 rounded-xl"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
      >
        Ativar
      </button>
    </form>
  );
}

// Sem este efeito o login "conclui" mas a tela continua no formulario: nada
// reage a sessao que o AuthSessionProvider acabou de resolver.
export function LoginPage({ mode }: { mode: 'signin' | 'signup' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, authClient } = useAuthSession();
  useEffect(() => {
    if (state.kind === 'initializing' || state.kind === 'anonymous') return;
    navigate(routeForAuthState(state) ?? destinationFromLocationState(location.state), {
      replace: true,
    });
  }, [state, navigate, location.state]);
  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header / Back Link */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
        <Link
          to="/painel"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
        </Link>
        <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
          Panelinha
        </span>
      </div>

      <div className="w-full z-10">
        <AuthForm
          mode={mode}
          loading={false}
          onSignIn={authClient.signIn}
          onSignUp={authClient.signUp}
          onGoogle={authClient.signInWithGoogle}
          onForgotPassword={() => navigate('/recuperar-senha')}
        />
      </div>
    </div>
  );
}

export function UsernameOnboardingPage() {
  const { completeUsername } = useAuthSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const handle = normalizeHandle(value);
  const formatError = value ? validateHandle(value) : null;
  const availability = useHandleAvailability(handle);

  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
        <Link
          to="/painel"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
        </Link>
        <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
          Panelinha
        </span>
      </div>

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 z-10">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            <User className="w-6 h-6" />
          </div>
          <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
            Escolha seu Username
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            Complete seu perfil escolhendo um identificador único para suas comunidades.
          </p>
        </div>

        {error && (
          <div
            className="alert alert-error alert-soft text-xs flex items-center gap-2 rounded-xl"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const invalid = validateHandle(value);
            if (invalid) {
              setError(invalid);
              return;
            }
            setError(null);
            try {
              await completeUsername(handle);
              const from = (location.state as { from?: { pathname?: string } } | null)?.from
                ?.pathname;
              navigate(from ?? '/', { replace: true });
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Não foi possível salvar o username.',
              );
            }
          }}
          className="space-y-4"
        >
          <div className="form-control">
            <label
              className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
              htmlFor="username"
            >
              Nome de usuário
            </label>
            <input
              id="username"
              type="text"
              placeholder="seu-nome"
              value={value}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              className="input input-bordered w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors"
              required
            />
          </div>
          {formatError ? (
            <p className="text-xs text-warning">{formatError}</p>
          ) : availability === 'checking' ? (
            <p className="text-xs text-base-content/60">Verificando…</p>
          ) : availability === 'taken' ? (
            <p className="text-xs text-error">@{handle} já está em uso.</p>
          ) : availability === 'free' ? (
            <p className="text-xs text-success">@{handle} está disponível.</p>
          ) : null}
          <button
            type="submit"
            disabled={availability === 'taken'}
            className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
          >
            Continuar
          </button>
        </form>
      </div>
    </div>
  );
}

export function PasswordRecoveryPage() {
  const { session, authClient } = useAuthSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const captchaPending = Boolean(captchaSiteKey()) && !captchaToken;
  const [newPassword, setNewPassword] = useState('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
        <Link
          to="/entrar"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Login
        </Link>
        <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
          Panelinha
        </span>
      </div>

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 z-10">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
            {session ? 'Redefinir Senha' : 'Recuperar Acesso'}
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            {session
              ? 'Digite sua nova senha para atualizar as credenciais de acesso.'
              : 'Informe seu e-mail cadastrado para receber as instruções de recuperação.'}
          </p>
        </div>

        {session ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setUpdateError(null);
              const lengthError = validatePasswordLength(newPassword);
              if (lengthError) {
                setUpdateError(lengthError);
                return;
              }
              try {
                await authClient.updatePassword(newPassword);
                await authClient.signOutOthers().catch(() => undefined);
                setUpdated(true);
              } catch (cause) {
                setUpdateError(
                  cause instanceof Error ? cause.message : 'Não foi possível atualizar a senha.',
                );
              }
            }}
            className="space-y-4"
          >
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="new-password"
              >
                Nova senha
              </label>
              <input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="input input-bordered w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors"
                required
              />
            </div>
            {updateError && (
              <div
                className="alert alert-error alert-soft text-xs flex items-center gap-2 rounded-xl"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{updateError}</span>
              </div>
            )}
            {updated ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-success font-bold">Senha atualizada com sucesso.</p>
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
                >
                  Continuar
                </button>
              </div>
            ) : (
              <button
                type="submit"
                className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
              >
                Salvar nova senha
              </button>
            )}
          </form>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await authClient.requestPasswordRecovery(email, captchaToken);
              setSent(true);
            }}
            className="space-y-4"
          >
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="recovery-email"
              >
                E-mail
              </label>
              <input
                id="recovery-email"
                type="email"
                placeholder="exemplo@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input input-bordered w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors"
                required
              />
            </div>
            <CaptchaField onToken={setCaptchaToken} />
            {sent && <p className="text-xs text-success font-bold mt-2">Confira seu e-mail.</p>}
            <button
              type="submit"
              disabled={captchaPending}
              className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
            >
              Enviar recuperacao
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
export function AuthLoadingPage() {
  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center z-10">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-xs font-bold uppercase tracking-wider text-base-content/60">
          Carregando Sessão...
        </p>
      </div>
    </div>
  );
}

export function AuthTransitionPage() {
  const { state } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (state.kind === 'initializing') return;
    const from = (location.state as { from?: RouteLocation } | null)?.from;
    navigate(resolveTransitionDestination(state, from), { replace: true });
  }, [state, navigate, location.state]);
  return <AuthLoadingPage />;
}

export function EmailVerificationPage() {
  const { signOut } = useAuthSession();
  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 text-center z-10">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
          <Mail className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-wider text-base-content">
          Confirme seu E-mail
        </h2>
        <p className="text-xs text-base-content/60 max-w-md mx-auto leading-relaxed">
          Enviamos um link de confirmação para o seu e-mail. Por favor, clique no link recebido para
          validar sua conta e continuar.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content mx-auto"
          onClick={() => void signOut()}
        >
          <LogOut className="w-4 h-4" /> Sair da conta
        </button>
      </div>
    </div>
  );
}

export function RecoverableSessionPage() {
  const { state, retry } = useAuthSession();
  const message = state.kind === 'recoverable_error' ? state.message : null;
  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 text-center z-10">
        <div className="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error mx-auto mb-3 shadow-inner">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-wider text-base-content">
          Não foi possível continuar
        </h2>
        {message && (
          <p className="text-xs text-base-content/60 max-w-md mx-auto leading-relaxed">{message}</p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm gap-2 rounded-xl mx-auto font-bold uppercase tracking-wider"
          onClick={() => void retry()}
        >
          <RefreshCw className="w-4 h-4" /> Tentar Novamente
        </button>
      </div>
    </div>
  );
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { retry, authClient, signOut } = useAuthSession();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    authClient
      .enrollTotp()
      .then(setEnrollment)
      .catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível iniciar a configuração.',
        );
      });
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await authClient.verifyTotp(code, enrollment?.factorId);
      await retry();
      navigate(destinationFromLocationState(location.state), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Código inválido.');
    }
  };

  if (!enrollment && error) {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 text-center z-10">
          <div className="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error mx-auto mb-3 shadow-inner">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-wider text-base-content">
            Não foi possível iniciar a configuração
          </h2>
          <p role="alert" className="text-xs text-base-content/60 max-w-md mx-auto">
            {error}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm rounded-xl font-bold uppercase tracking-wider"
            onClick={() => {
              setError(null);
              void authClient
                .enrollTotp()
                .then(setEnrollment)
                .catch((cause) => {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Não foi possível iniciar a configuração.',
                  );
                });
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!enrollment) return <AuthLoadingPage />;

  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
        <Link
          to="/painel"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="w-4 h-4" /> Painel
        </Link>
        <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
          Panelinha
        </span>
      </div>

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 text-center z-10">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
            Configurar Autenticação 2FA
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            Escaneie o QR Code abaixo no seu app autenticador (Authenticator, Authy) para ativar a
            segurança em 2 etapas.
          </p>
        </div>

        <TotpEnrollmentForm
          enrollment={enrollment}
          code={code}
          onCodeChange={setCode}
          onSubmit={(event) => void handleSubmit(event)}
          error={error}
        />

        <div className="pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1.5 text-xs text-base-content/50 hover:text-base-content"
            onClick={() => void signOut()}
          >
            <LogOut className="w-3.5 h-3.5" /> Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
}

// Se a sessao exige AAL2 e nao houver fator TOTP verificado ainda,
// verifyTotp() rejeita com essa mensagem (ver authClient.ts) e a pagina
// alterna para o fluxo de enrollment em vez de mostrar um erro sem saida.
const NO_VERIFIED_FACTOR_MESSAGE = 'Nenhum fator TOTP verificado.';

export function MfaChallengePage() {
  const { retry, authClient, signOut } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);

  const proceed = async (factorId?: string) => {
    if (factorId) {
      await authClient.verifyTotp(code, factorId);
    } else {
      await authClient.verifyTotp(code);
    }
    await retry();
    navigate(destinationFromLocationState(location.state), { replace: true });
  };

  const handleChallengeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await proceed();
    } catch (cause) {
      if (cause instanceof Error && cause.message === NO_VERIFIED_FACTOR_MESSAGE) {
        setCode('');
        try {
          setEnrollment(await authClient.enrollTotp());
        } catch (enrollCause) {
          setError(
            enrollCause instanceof Error
              ? enrollCause.message
              : 'Não foi possível iniciar a configuração.',
          );
        }
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Código inválido.');
    }
  };

  const handleEnrollSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await proceed(enrollment?.factorId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Código inválido.');
    }
  };

  if (enrollment) {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
          <Link
            to="/painel"
            className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
          >
            <ArrowLeft className="w-4 h-4" /> Painel
          </Link>
          <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
            Panelinha
          </span>
        </div>

        <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 text-center z-10">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
              Configurar Autenticação 2FA
            </h2>
            <p className="text-xs text-base-content/60 mt-1">
              Escaneie o QR Code abaixo no seu aplicativo para concluir o vínculo de segurança.
            </p>
          </div>

          <TotpEnrollmentForm
            enrollment={enrollment}
            code={code}
            onCodeChange={setCode}
            onSubmit={(event) => void handleEnrollSubmit(event)}
            error={error}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-4 flex items-center justify-between z-10 px-1">
        <Link
          to="/painel"
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
        </Link>
        <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
          Panelinha
        </span>
      </div>

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 z-10">
        <div className="text-center pt-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
            Confirme sua Identidade
          </h2>
          <p className="text-xs text-base-content/60 mt-1.5 leading-relaxed">
            Digite o código de 6 dígitos gerado pelo seu aplicativo autenticador (Google
            Authenticator, Authy, etc.).
          </p>
        </div>

        {error && (
          <div
            className="alert alert-error alert-soft text-xs flex items-center gap-2 rounded-xl"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(event) => void handleChallengeSubmit(event)} className="space-y-5">
          <div className="form-control text-center">
            <label
              htmlFor="challenge-code"
              className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1 justify-center"
            >
              Código de 6 dígitos
            </label>
            <OtpInput id="challenge-code" value={code} onChange={setCode} length={6} />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
          >
            Confirmar
          </button>
        </form>

        <div className="text-center pt-1 border-t border-base-300/50">
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1.5 text-xs text-base-content/50 hover:text-base-content"
            onClick={() => void signOut()}
          >
            <LogOut className="w-3.5 h-3.5" /> Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
}
