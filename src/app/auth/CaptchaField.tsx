import { Turnstile } from '@marsidev/react-turnstile';

export function captchaSiteKey(): string | undefined {
  // ponytail: import.meta.env.KEY must stay a direct, unwrapped property
  // access here — Vite/vitest's env reactivity (vi.stubEnv) only patches
  // this exact literal access pattern, not a cast or a captured reference.
  return import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
}

export function CaptchaField({ onToken }: { onToken(token: string | undefined): void }) {
  const siteKey = captchaSiteKey();
  if (!siteKey) return null;
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(undefined)}
      onError={() => onToken(undefined)}
      options={{ language: 'pt-br', size: 'flexible' }}
    />
  );
}
