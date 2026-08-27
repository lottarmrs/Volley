import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import { makeGame, makeSession } from '../test/fixtures';
import { useSessions } from './useSessions';

describe('useSessions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('inicia vazio quando não há dados no storage', () => {
    const { result } = renderHook(() => useSessions());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.games).toEqual([]);
    expect(result.current.activeSession).toBeNull();
  });

  it('hidrata sessões gravadas no localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([makeSession('s1')]));
    const { result } = renderHook(() => useSessions());
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('s1');
  });

  it('persiste sessões no localStorage quando o estado muda', () => {
    const { result } = renderHook(() => useSessions());
    act(() => {
      result.current.setSessions([makeSession('s1', { name: 'Persistida' })]);
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Persistida');
  });

  it('remove no startup jogos órfãos de sessões que não existem mais', () => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([makeSession('s1')]));
    localStorage.setItem(
      STORAGE_KEYS.games,
      JSON.stringify([makeGame('g1', 's1'), makeGame('g2', 'sessao-fantasma')]),
    );
    const { result } = renderHook(() => useSessions());
    expect(result.current.games.map((g) => g.id)).toEqual(['g1']);
  });

  it('mantém jogos da sessão ativa mesmo fora da lista de sessões', () => {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(makeSession('ativa')));
    localStorage.setItem(STORAGE_KEYS.games, JSON.stringify([makeGame('g1', 'ativa')]));
    const { result } = renderHook(() => useSessions());
    expect(result.current.games).toHaveLength(1);
  });

  it('updateActiveSession sincroniza a sessão ativa e a lista', () => {
    const session = makeSession('s1', { name: 'Original' });
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([session]));
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(session));
    const { result } = renderHook(() => useSessions());
    act(() => {
      result.current.updateActiveSession({ ...result.current.activeSession!, name: 'Editada' });
    });
    expect(result.current.activeSession!.name).toBe('Editada');
    expect(result.current.sessions[0].name).toBe('Editada');
  });
});
