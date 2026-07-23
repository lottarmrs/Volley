export function captchaSiteKey(): string | undefined {
  // ponytail: import.meta.env.KEY must stay a direct, unwrapped property
  // access here — Vite/vitest's env reactivity (vi.stubEnv) only patches
  // this exact literal access pattern, not a cast or a captured reference.
  return import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
}
