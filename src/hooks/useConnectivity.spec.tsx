import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectivity } from './useConnectivity';

function setBrowserOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('useConnectivity', () => {
  beforeEach(() => setBrowserOnline(true));
  afterEach(() => vi.restoreAllMocks());

  it('comeca com o que o browser diz', () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.state).toBe('online');
  });

  it('o evento offline do browser derruba o estado', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => {
      setBrowserOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.state).toBe('offline');
  });

  it('uma falha de rede reportada vence o browser otimista', () => {
    // Wi-fi de ginasio: onLine continua true, mas nada sai.
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('network_failure'));
    expect(result.current.state).toBe('offline');
  });

  it('um sucesso reportado religa mesmo com o browser dizendo offline', () => {
    setBrowserOnline(false);
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('success'));
    expect(result.current.state).toBe('online');
  });

  it('onlineAt muda quando a rede volta, para servir de gatilho', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('network_failure'));
    const antes = result.current.onlineAt;
    act(() => {
      setBrowserOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.onlineAt).not.toBe(antes);
  });
});
