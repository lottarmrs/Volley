import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Mail,
  Lock,
  User,
  AtSign,
  LogIn,
  UserPlus,
  AlertCircle,
  Chrome,
  Eye,
  EyeOff,
  Check,
  Loader2,
} from 'lucide-react';
import { CaptchaField } from '../../app/auth/CaptchaField';
import { captchaSiteKey } from '../../app/auth/captchaEnv';
import { validatePasswordLength } from '../../app/auth/passwordPolicy';
import { searchPlayerByUsernameQuery } from '../../application/communityPlayerSearchUseCases';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const BLOCKLIST = [
  'admin',
  'suporte',
  'root',
  'api',
  'help',
  'login',
  'register',
  'panelinha',
  'master',
  'sistema',
];

export interface AuthFormProps {
  mode: 'signin' | 'signup';
  loading: boolean;
  onSignIn(email: string, password: string, captchaToken?: string): Promise<void>;
  onSignUp(
    email: string,
    password: string,
    name: string,
    username: string,
    claimCode?: string,
    captchaToken?: string,
  ): Promise<void>;
  onGoogle(): Promise<void>;
  onForgotPassword(): void;
}

export function AuthForm({
  mode,
  loading,
  onSignIn,
  onSignUp,
  onGoogle,
  onForgotPassword,
}: AuthFormProps) {
  const isSignUp = mode === 'signup';
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const captchaRequired = Boolean(captchaSiteKey());
  const captchaPending = captchaRequired && !captchaToken;
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    confirmEmail?: string;
    password?: string;
    confirmPassword?: string;
    username?: string;
    name?: string;
  }>({});

  const checkUsernameAvailability = async (value: string) => {
    const normalized = value.trim().toLowerCase();
    setUsernameAvailable(null);

    if (!normalized) {
      setFieldErrors((prev) => ({ ...prev, username: 'Escolha um username.' }));
      return false;
    }
    if (!USERNAME_PATTERN.test(normalized)) {
      setFieldErrors((prev) => ({
        ...prev,
        username: 'Use 3 a 30 caracteres (letras minúsculas, números, _ ou -).',
      }));
      return false;
    }
    if (BLOCKLIST.includes(normalized)) {
      setFieldErrors((prev) => ({ ...prev, username: 'Este nome não é permitido.' }));
      return false;
    }

    setCheckingUsername(true);
    try {
      const res = await searchPlayerByUsernameQuery(normalized);
      setCheckingUsername(false);
      if (res.ok && res.value) {
        setFieldErrors((prev) => ({
          ...prev,
          username: 'Este username já está em uso. Escolha outro.',
        }));
        setUsernameAvailable(false);
        return false;
      } else {
        setFieldErrors((prev) => ({ ...prev, username: undefined }));
        setUsernameAvailable(true);
        return true;
      }
    } catch {
      setCheckingUsername(false);
      setFieldErrors((prev) => ({ ...prev, username: undefined }));
      return true;
    }
  };

  const validateField = (
    field: 'email' | 'confirmEmail' | 'password' | 'confirmPassword' | 'username' | 'name',
    value: string,
  ) => {
    let err: string | undefined = undefined;
    if (field === 'email') {
      const trimmed = value.trim();
      if (!trimmed) {
        err = 'Informe o seu e-mail.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        err = 'Por favor, insira um e-mail válido (ex: nome@dominio.com).';
      }
    } else if (field === 'confirmEmail' && isSignUp) {
      const trimmed = value.trim();
      if (trimmed && trimmed.toLowerCase() !== email.trim().toLowerCase()) {
        err = 'Os e-mails informados não coincidem.';
      }
    } else if (field === 'password') {
      const passwordError = validatePasswordLength(value);
      if (passwordError) err = passwordError;
    } else if (field === 'confirmPassword' && isSignUp) {
      if (value && value !== password) {
        err = 'As senhas informadas não coincidem.';
      }
    } else if (field === 'username' && isSignUp) {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        err = 'Escolha um username.';
      } else if (!USERNAME_PATTERN.test(normalized)) {
        err = 'Use 3 a 30 caracteres (letras minúsculas, números, _ ou -).';
      } else if (BLOCKLIST.includes(normalized)) {
        err = 'Este nome não é permitido.';
      }
    } else if (field === 'name' && isSignUp) {
      const trimmed = value.trim();
      if (trimmed && trimmed.length < 2) {
        err = 'Informe pelo menos 2 caracteres no seu nome.';
      }
    }

    setFieldErrors((prev) => ({ ...prev, [field]: err }));
    return err;
  };

  const handleBlur = (
    field: 'email' | 'confirmEmail' | 'password' | 'confirmPassword' | 'username' | 'name',
    value: string,
  ) => {
    validateField(field, value);
    if (field === 'username' && isSignUp && value.trim()) {
      checkUsernameAvailability(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emailErr = validateField('email', email);
    const confirmEmailErr = isSignUp ? validateField('confirmEmail', confirmEmail) : undefined;
    const passErr = validateField('password', password);
    const confirmPassErr = isSignUp ? validateField('confirmPassword', confirmPassword) : undefined;
    const nameErr = isSignUp ? validateField('name', name) : undefined;
    const userErr = isSignUp ? validateField('username', username) : undefined;

    setFieldErrors({
      email: emailErr,
      confirmEmail: confirmEmailErr,
      password: passErr,
      confirmPassword: confirmPassErr,
      name: nameErr,
      username: userErr,
    });

    if (emailErr || confirmEmailErr || passErr || confirmPassErr || nameErr || userErr) {
      return;
    }

    try {
      if (isSignUp) {
        const normalizedUsername = username.trim().toLowerCase();
        const normalizedClaimCode = claimCode.trim().toUpperCase();
        await onSignUp(
          email,
          password,
          name.trim(),
          normalizedUsername,
          normalizedClaimCode || undefined,
          captchaToken,
        );
        setSuccess('Conta criada com sucesso! Verifique seu e-mail ou tente fazer o login.');
        setName('');
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setConfirmEmail('');
        setClaimCode('');
        setFieldErrors({});
        setUsernameAvailable(null);
      } else {
        await onSignIn(email, password, captchaToken);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao processar a autenticação.');
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSuccess(null);
    try {
      await onGoogle();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao processar a autenticação.');
    }
  };

  return (
    <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md mx-auto shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden">
      {/* Tab Header Switcher */}
      <div className="grid grid-cols-2 p-1.5 bg-base-300/50 border-b border-base-300/60 text-xs font-black uppercase tracking-wider text-center">
        <Link
          to="/entrar"
          className={`py-3 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 ${
            !isSignUp
              ? 'bg-primary text-primary-content shadow-md font-bold'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
          }`}
        >
          <LogIn className="w-4 h-4" /> Entrar
        </Link>
        <Link
          to="/cadastro"
          className={`py-3 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 ${
            isSignUp
              ? 'bg-primary text-primary-content shadow-md font-bold'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
          }`}
        >
          <UserPlus className="w-4 h-4" /> Criar Conta
        </Link>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {/* Brand Badge & Header Title */}
        <div className="text-center pt-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            {isSignUp ? <UserPlus className="w-6 h-6" /> : <LogIn className="w-6 h-6" />}
          </div>
          <h2 className="text-xl uppercase font-black tracking-wider text-base-content">
            {isSignUp ? 'Criar Nova Conta' : 'Entrar no Sistema'}
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            {isSignUp
              ? 'Cadastre-se para sincronizar seus dados e comunidades na nuvem.'
              : 'Faça login para acessar suas peladas e dados sincronizados.'}
          </p>
        </div>

        {error && (
          <div
            className="alert alert-error alert-soft text-xs flex items-start gap-2 rounded-xl"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success alert-soft text-xs flex items-start gap-2 rounded-xl">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="auth-name"
              >
                Nome de exibicao
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
                  id="auth-name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  onBlur={(e) => handleBlur('name', e.target.value)}
                  className={`input input-bordered pl-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                    fieldErrors.name ? 'input-error' : ''
                  }`}
                  disabled={loading}
                  autoFocus={isSignUp}
                />
              </div>
              {fieldErrors.name && (
                <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{fieldErrors.name}</span>
                </p>
              )}
            </div>
          )}

          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1 flex justify-between"
                htmlFor="auth-username"
              >
                <span>Username</span>
                {checkingUsername && (
                  <span className="text-[10px] text-base-content/50 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
                  </span>
                )}
                {!checkingUsername && usernameAvailable === true && (
                  <span className="text-[10px] text-success font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Disponível!
                  </span>
                )}
              </label>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
                  id="auth-username"
                  type="text"
                  placeholder="seu-username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameAvailable(null);
                    if (fieldErrors.username)
                      setFieldErrors((prev) => ({ ...prev, username: undefined }));
                  }}
                  onBlur={(e) => {
                    handleBlur('username', e.target.value);
                  }}
                  className={`input input-bordered pl-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                    fieldErrors.username
                      ? 'input-error'
                      : usernameAvailable === true
                        ? 'input-success'
                        : ''
                  }`}
                  disabled={loading}
                  required
                />
              </div>
              {fieldErrors.username && (
                <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{fieldErrors.username}</span>
                </p>
              )}
            </div>
          )}

          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="auth-claim-code"
              >
                Código do atleta
              </label>
              <div className="relative">
                <input
                  id="auth-claim-code"
                  type="text"
                  placeholder="Código de convite"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  className="input input-bordered w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div className="form-control">
            <label
              className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
              htmlFor="auth-email"
            >
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
              <input
                id="auth-email"
                type="email"
                placeholder="exemplo@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                onBlur={(e) => handleBlur('email', e.target.value)}
                className={`input input-bordered pl-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                  fieldErrors.email ? 'input-error' : ''
                }`}
                autoComplete="email"
                disabled={loading}
                autoFocus={!isSignUp}
                required
              />
            </div>
            {fieldErrors.email && (
              <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{fieldErrors.email}</span>
              </p>
            )}
          </div>

          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="auth-confirm-email"
              >
                Confirmar E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
                  id="auth-confirm-email"
                  type="email"
                  placeholder="Repita o seu e-mail"
                  value={confirmEmail}
                  onChange={(e) => {
                    setConfirmEmail(e.target.value);
                    if (fieldErrors.confirmEmail)
                      setFieldErrors((prev) => ({ ...prev, confirmEmail: undefined }));
                  }}
                  onBlur={(e) => handleBlur('confirmEmail', e.target.value)}
                  className={`input input-bordered pl-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                    fieldErrors.confirmEmail ? 'input-error' : ''
                  }`}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              {fieldErrors.confirmEmail && (
                <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{fieldErrors.confirmEmail}</span>
                </p>
              )}
            </div>
          )}

          <div className="form-control">
            <label
              className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1 flex justify-between"
              htmlFor="auth-password"
            >
              <span>Senha</span>
              {!isSignUp && (
                <button
                  type="button"
                  className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                  onClick={onForgotPassword}
                  disabled={loading}
                >
                  Esqueci minha senha
                </button>
              )}
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password)
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                onBlur={(e) => handleBlur('password', e.target.value)}
                className={`input input-bordered pl-10 pr-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                  fieldErrors.password ? 'input-error' : ''
                }`}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                disabled={loading}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors p-1"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{fieldErrors.password}</span>
              </p>
            ) : (
              isSignUp && (
                <p className="text-[10px] text-base-content/50 mt-1">Mínimo de 6 caracteres.</p>
              )
            )}
          </div>

          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-[11px] font-bold uppercase tracking-wider text-base-content/70 pb-1"
                htmlFor="auth-confirm-password"
              >
                Confirmar Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repita a sua senha"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword)
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
                  onBlur={(e) => handleBlur('confirmPassword', e.target.value)}
                  className={`input input-bordered pl-10 pr-10 w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors ${
                    fieldErrors.confirmPassword ? 'input-error' : ''
                  }`}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors p-1"
                  title={showConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p role="alert" className="text-[11px] text-error mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{fieldErrors.confirmPassword}</span>
                </p>
              )}
            </div>
          )}

          <CaptchaField onToken={setCaptchaToken} />

          <button
            type="submit"
            className="btn btn-primary btn-block uppercase tracking-wider text-xs font-black h-12 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all mt-2"
            disabled={loading || captchaPending}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4 mr-1" /> Criar conta
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-1" /> Entrar no Sistema
              </>
            )}
          </button>
        </form>

        <div className="divider text-[10px] opacity-40 uppercase tracking-widest my-2">
          Ou acesse com
        </div>

        <button
          type="button"
          className="btn btn-outline btn-block uppercase tracking-wider text-xs font-bold gap-2.5 h-11 rounded-xl border-base-300 hover:bg-base-300/40 transition-colors"
          onClick={handleGoogle}
          disabled={loading}
        >
          <Chrome className="w-4 h-4" /> Continuar com Google
        </button>
      </div>
    </div>
  );
}
