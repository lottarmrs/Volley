import { Turnstile } from '@marsidev/react-turnstile';
import { captchaSiteKey } from './captchaEnv';

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
