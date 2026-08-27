import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptchaField as CaptchaFieldType } from './CaptchaField';

const { turnstilePropsMock } = vi.hoisted(() => ({
  turnstilePropsMock: { current: null as unknown as Record<string, unknown> },
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: Record<string, unknown>) => {
    turnstilePropsMock.current = props;
    return null;
  },
}));

// Reimport per test (with vi.resetModules) so the module-level env snapshot
// in CaptchaField.tsx picks up the env var stubbed for that test.
async function loadCaptchaField(): Promise<typeof CaptchaFieldType> {
  vi.resetModules();
  const mod = await import('./CaptchaField');
  return mod.CaptchaField;
}

describe('CaptchaField', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    turnstilePropsMock.current = null as unknown as Record<string, unknown>;
  });

  it('renders nothing when no site key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const CaptchaField = await loadCaptchaField();
    const onToken = vi.fn();
    const { container } = render(<CaptchaField onToken={onToken} />);
    expect(container.innerHTML).toBe('');
  });

  it('forwards a successful challenge token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const CaptchaField = await loadCaptchaField();
    const onToken = vi.fn();
    render(<CaptchaField onToken={onToken} />);
    (turnstilePropsMock.current.onSuccess as (token: string) => void)('token-1');
    expect(onToken).toHaveBeenCalledWith('token-1');
  });

  it('clears the token on expiry', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const CaptchaField = await loadCaptchaField();
    const onToken = vi.fn();
    render(<CaptchaField onToken={onToken} />);
    (turnstilePropsMock.current.onExpire as () => void)();
    expect(onToken).toHaveBeenCalledWith(undefined);
  });

  it('clears the token on error', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const CaptchaField = await loadCaptchaField();
    const onToken = vi.fn();
    render(<CaptchaField onToken={onToken} />);
    (turnstilePropsMock.current.onError as () => void)();
    expect(onToken).toHaveBeenCalledWith(undefined);
  });
});
