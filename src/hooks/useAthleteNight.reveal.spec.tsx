import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AthleteNightReveal } from '../components/player/AthleteNightReveal';
import { buildVutCard, type BuildVutCardContext } from '@logic/futCards';
import type { CardStatRow } from '@app/cardStats';
import type { Community, Player } from '@shared/types';
import { useAthleteNight } from './useAthleteNight';

const fetchPendingNight = vi.fn();
const fetchCardStats = vi.fn();
vi.mock('@infra/supabase/careerCloudService', () => ({
  careerCloudService: {
    fetchPendingNight: () => fetchPendingNight(),
    markNightSeen: () => Promise.resolve(),
  },
}));
vi.mock('@infra/supabase/communitySkillProfileCloudService', () => ({
  communitySkillProfileCloudService: {
    fetchCardStats: (id: string) => fetchCardStats(id),
  },
}));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));

const CHAVES = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
];

const ana = {
  id: 'ana',
  cloudId: 'uuid-ana',
  userId: 'conta-ana',
  nome: 'Ana Souza',
  apelido: 'Ana',
  posicaoPrincipal: 'ponteiro',
  maoDominante: 'direita',
  atributos: Object.fromEntries(CHAVES.map((chave) => [chave, 2])),
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
} as unknown as Player;

const history = {
  sessions: [
    {
      id: 's1',
      cloudId: 'uuid-s1',
      communityId: 'c1',
      name: 's1',
      date: '2026-10-04',
      status: 'finished',
    },
  ],
  teams: [
    { id: 't1', sessionId: 's1', name: 'A', playerIds: ['ana'] },
    { id: 't2', sessionId: 's1', name: 'B', playerIds: ['bia'] },
  ],
  games: [],
  pointEvents: [],
  players: [ana],
  sessionReports: [],
} as unknown as BuildVutCardContext;

const communities = [{ id: 'c1', cloudId: 'uuid-c1', name: 'Vôlei de Terça' }] as Community[];

const avaliacao: CardStatRow[] = CHAVES.map((dimensionKey) => ({
  playerId: 'uuid-ana',
  dimensionKey,
  value: 8,
}));

function Bancada() {
  const athleteNight = useAthleteNight({
    userId: 'conta-ana',
    players: [ana],
    communities,
    history,
  });
  return athleteNight.night ? (
    <AthleteNightReveal
      night={athleteNight.night}
      communityName={athleteNight.communityName ?? ''}
      sessionDate={athleteNight.sessionDate}
      onOpened={athleteNight.markSeen}
      onClose={athleteNight.dismiss}
      onViewCard={athleteNight.dismiss}
    />
  ) : null;
}

describe('Sua noite com os numeros chegando depois da noite pendente', () => {
  beforeEach(() => {
    fetchPendingNight.mockReset();
    fetchCardStats.mockReset();
  });

  it('a primeira carta mostrada ja tem os numeros da avaliacao', async () => {
    let entregar: (rows: CardStatRow[]) => void = () => {};
    fetchPendingNight.mockResolvedValue({ sessionId: 'uuid-s1', communityId: 'uuid-c1' });
    fetchCardStats.mockReturnValue(
      new Promise<CardStatRow[]>((resolve) => {
        entregar = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Bancada />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchCardStats).toHaveBeenCalledWith('uuid-c1'));
    expect(screen.queryByRole('dialog', { name: 'Sua noite' })).toBeNull();

    await act(async () => {
      entregar(avaliacao);
    });

    const esperada = buildVutCard(ana, {
      ...history,
      skillValues: new Map([['ana', Object.fromEntries(CHAVES.map((chave) => [chave, 8]))]]),
    });
    const antiga = buildVutCard(ana, history);
    expect(esperada.stats.ovr).not.toBe(antiga.stats.ovr);

    const dialogo = await screen.findByRole('dialog', { name: 'Sua noite' });
    fireEvent.click(within(dialogo).getByRole('button', { name: /abrir/i }));
    const ovr = dialogo.querySelector('.text-\\[38px\\]');
    expect(ovr?.textContent).toBe(String(esperada.stats.ovr));
  });
});
