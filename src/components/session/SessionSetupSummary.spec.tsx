import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionSetupSummary } from './SessionSetupSummary';
import {
  executeSessionCohortTransition,
  inspectLegacySessionCutover,
  transitionLegacySessionCommand,
} from '@app/sessionCohortCutover';
import { STORAGE_KEYS } from '@storage/localStorageRepository';
import { makeSession } from '../../test/fixtures';

vi.mock('@app/sessionCohortCutover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/sessionCohortCutover')>()),
  inspectLegacySessionCutover: vi.fn(),
  transitionLegacySessionCommand: vi.fn(),
  executeSessionCohortTransition: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(inspectLegacySessionCutover).mockReset();
  vi.mocked(transitionLegacySessionCommand).mockReset();
  vi.mocked(executeSessionCohortTransition).mockReset();
});

describe('SessionSetupSummary — conversão para a coorte target', () => {
  it('mostra os bloqueios traduzidos quando a Session nao e elegivel', async () => {
    const session = makeSession('s1', {
      communityId: 'community-1',
      cloudId: 'cloud-s1',
      status: 'draft',
    });
    vi.mocked(inspectLegacySessionCutover).mockResolvedValue({
      eligible: false,
      blockers: ['NOT_DRAFT', 'HAS_TEAM_EVIDENCE'],
      sourceFingerprint: 'fp-1',
      selectedPlayerCount: 0,
    });

    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Converter para o novo sistema' }));

    expect(await screen.findByText('Esta Sessão não está mais em rascunho.')).toBeTruthy();
    expect(screen.getByText('Esta Sessão já tem times formados.')).toBeTruthy();
    expect(screen.queryByText('NOT_DRAFT')).toBeNull();
    expect(screen.queryByText('HAS_TEAM_EVIDENCE')).toBeNull();
  });

  it('mostra uma mensagem honesta para um codigo de bloqueio desconhecido', async () => {
    const session = makeSession('s1', {
      communityId: 'community-1',
      cloudId: 'cloud-s1',
      status: 'draft',
    });
    vi.mocked(inspectLegacySessionCutover).mockResolvedValue({
      eligible: false,
      blockers: ['SOME_NEW_CODE'],
      sourceFingerprint: 'fp-1',
      selectedPlayerCount: 0,
    });

    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Converter para o novo sistema' }));

    expect(await screen.findByText(/SOME_NEW_CODE/)).toBeTruthy();
  });

  it('avisa que a conversao nao tem volta antes de executar', async () => {
    const session = makeSession('s1', {
      communityId: 'community-1',
      cloudId: 'cloud-s1',
      status: 'draft',
    });
    vi.mocked(inspectLegacySessionCutover).mockResolvedValue({
      eligible: true,
      blockers: [],
      sourceFingerprint: 'fp-1',
      selectedPlayerCount: 4,
    });

    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Converter para o novo sistema' }));

    expect(await screen.findByText(/não tem volta/)).toBeTruthy();
    expect(transitionLegacySessionCommand).not.toHaveBeenCalled();
    expect(executeSessionCohortTransition).not.toHaveBeenCalled();
  });

  it('marca a Session como target quando a transicao conclui', async () => {
    const session = makeSession('s1', {
      communityId: 'community-1',
      cloudId: 'cloud-s1',
      status: 'draft',
      type: 'free_play',
    });
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([session]));

    vi.mocked(inspectLegacySessionCutover).mockResolvedValue({
      eligible: true,
      blockers: [],
      sourceFingerprint: 'fp-1',
      selectedPlayerCount: 4,
    });
    const envelope = {
      commandId: 'cmd-1',
      payload: {
        p_command_id: 'cmd-1',
        p_session_id: 'cloud-s1',
        p_expected_source_fingerprint: 'fp-1',
        p_session_context: 'COMMUNITY' as const,
        p_play_mode: 'FREE_PLAY' as const,
      },
    };
    vi.mocked(transitionLegacySessionCommand).mockReturnValue(envelope);
    vi.mocked(executeSessionCohortTransition).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: undefined,
      commandId: 'cmd-1',
    });

    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Converter para o novo sistema' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar conversão' }));

    await screen.findByText('Sessão convertida para o novo sistema.');

    expect(transitionLegacySessionCommand).toHaveBeenCalledWith(
      'cloud-s1',
      'fp-1',
      'COMMUNITY',
      'FREE_PLAY',
    );

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) ?? '[]');
    const persisted = stored.find((s: { id: string }) => s.id === 's1');
    expect(persisted?.authorityModel).toBe('target');
  });

  it('nao oferece a conversao para uma Session sem comunidade', () => {
    const session = makeSession('s1', { communityId: null, cloudId: 'cloud-s1' });
    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);

    expect(screen.queryByRole('button', { name: 'Converter para o novo sistema' })).toBeNull();
  });

  it('nao oferece a conversao para uma Session ja migrada para o novo sistema', () => {
    const session = makeSession('s1', {
      communityId: 'community-1',
      cloudId: 'cloud-s1',
      authorityModel: 'target',
    });
    render(<SessionSetupSummary session={session} selectedPlayers={[]} />);

    expect(screen.queryByRole('button', { name: 'Converter para o novo sistema' })).toBeNull();
  });
});
