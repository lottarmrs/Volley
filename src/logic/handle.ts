import { slugify } from './username';

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

export function validateHandle(input: string): string | null {
  const handle = normalizeHandle(input);
  if (!handle) return 'Escolha um nome de usuário.';
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return 'Use de 3 a 30 caracteres.';
  }
  if (!/^[a-z0-9]/.test(handle)) return 'Comece com uma letra ou número.';
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Use apenas letras sem acento, números, hífen e underline.';
  }
  return null;
}

export function suggestHandle(name: string, taken: Iterable<string>): string | undefined {
  const base = slugify(name);
  if (!base) return undefined;
  const used = new Set(taken);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return validateHandle(candidate) === null ? candidate : undefined;
}
