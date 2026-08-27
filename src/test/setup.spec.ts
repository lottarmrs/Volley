import { describe, expect, it } from 'vitest';

describe('vitest setup', () => {
  it('roda em ambiente jsdom com localStorage disponível', () => {
    localStorage.setItem('smoke', '1');
    expect(localStorage.getItem('smoke')).toBe('1');
    expect(typeof document).toBe('object');
  });
});
