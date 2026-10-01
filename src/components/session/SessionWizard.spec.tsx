import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Community, Division, Player, Session } from '@shared/types';
import type { SessionWizardModel } from '@app/screens/sessionWizard/sessionWizardModel';
import type { SessionWizardIntent } from '@app/screens/sessionWizard/sessionWizardIntents';
import { SessionWizard } from './SessionWizard';
import { makeFreePlayConfig, makePlayer, makeSession, makeTeam } from '../../test/fixtures';

const NOMES = [
  'Ana Prado',
  'Bianca Ferraz',
  'Caio Medeiros',
  'Duda Rocha',
  'Enzo Tavares',
  'Fernanda Lopes',
  'Gustavo Neri',
  'Helena Vasconcelos',
  'Ivan Muniz',
  'Júlia Campos',
];

const ELENCO: Player[] = NOMES.map((nome, indice) =>
  makePlayer(`p${indice + 1}`, {
    nome,
    apelido: nome.split(' ')[0],
    genero: indice % 3 === 0 ? 'F' : 'M',
  }),
);

const COMUNIDADE: Community = {
  id: 'c-1',
  cloudId: 'cloud-1',
  name: 'Terça Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function pelada(overrides: Partial<Session> = {}): Session {
  return makeSession('s-1', {
    communityId: 'c-1',
    name: 'Terça Forte - 01/10/2026',
    date: '2026-10-01',
    status: 'draft',
    type: 'free_play',
    selectedPlayerIds: [],
    teamIds: [],
    config: makeFreePlayConfig(),
    ...overrides,
  });
}

const DIVISAO: Division = {
  teams: [
    makeTeam('t1', 's-1', ['p1', 'p2', 'p3', 'p4', 'p5']),
    makeTeam('t2', 's-1', ['p6', 'p7', 'p8', 'p9', 'p10']),
  ],
  penalty: 1,
  score: 90,
};

function renderPasso(model: Partial<SessionWizardModel> & { activeSession: Session }) {
  const intents: SessionWizardIntent[] = [];
  const dispatch = vi.fn(async (intent: SessionWizardIntent) => {
    intents.push(intent);
  });
  const view = render(
    <MemoryRouter>
      <SessionWizard
        contract={{
          model: {
            players: ELENCO,
            communities: [COMUNIDADE],
            canEditGuestDetails: false,
            wizardStep: 0,
            validationErrors: {},
            bestDivisions: [],
            selectedDivisionIndex: 0,
            isGenerating: false,
            generationProgress: 0,
            generationStage: null,
            authorizedDraw: null,
            publicationState: 'idle',
            publicationError: null,
            partnershipMatrix: undefined,
            canSchedule: true,
            primaryAction: 'schedule',
            isScheduled: false,
            scheduleError: null,
            stepLabels: ['Sessão', 'Atletas', 'Formato', 'Regras', 'Revisão', 'Times', 'Tabela'],
            positionLabels: {
              levantador: 'Levantador',
              ponteiro: 'Ponteiro',
              oposto: 'Oposto',
              central: 'Central',
              libero: 'Líbero',
              'all-rounder': 'Curinga',
            },
            positionOrder: ['levantador', 'ponteiro', 'oposto', 'central', 'libero', 'all-rounder'],
            ...model,
          } as SessionWizardModel,
          dispatch,
        }}
      />
    </MemoryRouter>,
  );
  return { intents, view };
}

function contratoVisivel() {
  const titulos = screen
    .queryAllByRole('heading')
    .map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
  const botoes = screen
    .queryAllByRole('button')
    .map((b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim());
  return { titulos, botoes };
}

const selecionados = ELENCO.map((p) => p.id);

describe('SessionWizard — caracterizacao antes da quebra', () => {
  it('passo 0 com nuvem: marcar e o primario', () => {
    const { intents } = renderPasso({ activeSession: pelada() });
    expect(contratoVisivel()).toMatchSnapshot();
    fireEvent.click(screen.getAllByRole('button', { name: /^marcar pelada$/i }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /escolher os atletas na m[aã]o/i }));
    expect(intents.map((i) => i.kind)).toMatchSnapshot();
  });

  it('passo 0 ja marcada: o caminho e abrir a lista', () => {
    renderPasso({ activeSession: pelada(), isScheduled: true });
    expect(contratoVisivel()).toMatchSnapshot();
  });

  it('passo 0 sem nuvem: o manual e o caminho', () => {
    renderPasso({
      activeSession: pelada(),
      communities: [{ ...COMUNIDADE, cloudId: undefined }],
      primaryAction: 'manual',
    });
    expect(contratoVisivel()).toMatchSnapshot();
  });

  it('passo 1: atletas escolhidos, selecionar e limpar', () => {
    const { intents } = renderPasso({
      activeSession: pelada({ selectedPlayerIds: selecionados.slice(0, 6) }),
      wizardStep: 1,
    });
    expect(contratoVisivel()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: /^limpar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(intents).toMatchSnapshot();
  });

  it('passo 2: formato', () => {
    const { intents } = renderPasso({
      activeSession: pelada({ selectedPlayerIds: selecionados.slice(0, 6) }),
      wizardStep: 2,
    });
    expect(contratoVisivel()).toMatchSnapshot();
    fireEvent.click(screen.getByText(/^torneio$/i));
    expect(intents).toMatchSnapshot();
  });

  it('passo 3: regras, com o erro de atletas de menos', () => {
    renderPasso({
      activeSession: pelada({ selectedPlayerIds: selecionados.slice(0, 4) }),
      wizardStep: 3,
      validationErrors: { teamCount: 'Para 3 times, selecione pelo menos 9 jogadores.' },
    });
    expect(contratoVisivel()).toMatchSnapshot();
  });

  it('passo 4: revisao', () => {
    const { intents } = renderPasso({
      activeSession: pelada({ selectedPlayerIds: selecionados }),
      wizardStep: 4,
    });
    expect(contratoVisivel()).toMatchSnapshot();
    const sortear = screen.queryAllByRole('button', { name: /sortear|gerar/i }).at(-1);
    if (sortear) fireEvent.click(sortear);
    expect(intents).toMatchSnapshot();
  });

  it('passo 5: times sorteados', () => {
    const { intents } = renderPasso({
      activeSession: pelada({ selectedPlayerIds: selecionados, status: 'teams_generated' }),
      wizardStep: 5,
      bestDivisions: [DIVISAO],
    });
    expect(contratoVisivel()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: /gerar tabela/i }));
    expect(intents).toMatchSnapshot();
  });

  it('passo 6: tabela do torneio', () => {
    const torneio = pelada({
      type: 'tournament',
      selectedPlayerIds: selecionados,
      status: 'teams_generated',
      config: { type: 'tournament', format: 'round_robin', teamCount: 2 } as Session['config'],
    });
    const { intents } = renderPasso({
      activeSession: torneio,
      wizardStep: 6,
      bestDivisions: [DIVISAO],
    });
    expect(contratoVisivel()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: /iniciar torneio/i }));
    expect(intents).toMatchSnapshot();
  });

  it('o progresso mostra os sete passos', () => {
    renderPasso({ activeSession: pelada(), wizardStep: 2 });
    const nav = screen.queryByRole('navigation') ?? document.body;
    expect(
      within(nav).getAllByText(/sess[aã]o|atletas|formato|regras|revis[aã]o|times|tabela/i).length,
    ).toBeGreaterThan(0);
  });
});
