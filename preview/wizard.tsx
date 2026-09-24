import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import type { Community, Player, Session } from '../src/types';
import type { SessionWizardModel } from '../src/application/screens/sessionWizard/sessionWizardModel';
import type { SessionWizardIntent } from '../src/application/screens/sessionWizard/sessionWizardIntents';
import type { ScreenContract } from '../src/application/screens/screenContract';
import { SessionWizard } from '../src/components/session/SessionWizard';
import { makeFreePlayConfig, makePlayer, makeSession } from '../src/test/fixtures';
import '../src/index.css';

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

const COMUNIDADE_NA_NUVEM: Community = {
  id: 'c-1',
  cloudId: 'cloud-1',
  name: 'Terça Forte',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COMUNIDADE_LOCAL: Community = { ...COMUNIDADE_NA_NUVEM, cloudId: undefined };

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

/** O contrato inteiro, com tudo inerte: a bancada mostra a tela, não simula o
 *  wizard. Cada estado é montado à mão, que é o que deixa os casos difíceis
 *  (sem nuvem, com erro, já marcada) visíveis sem precisar chegar neles. */
function contrato(
  model: Partial<SessionWizardModel> & { activeSession: Session },
): ScreenContract<SessionWizardModel, SessionWizardIntent> {
  return {
    model: {
      players: ELENCO,
      communities: [COMUNIDADE_NA_NUVEM],
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
      // Faltavam, e o passo 4 quebrava com "undefined.map" -- a bancada achou a
      // propria lacuna. Copiados do contrato de verdade para nao mentir.
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
    dispatch: async () => {},
  };
}

const ESTADOS: { nome: string; contrato: ReturnType<typeof contrato> }[] = [
  {
    nome: 'Passo 0 — com nuvem: marcar é o primário',
    contrato: contrato({ activeSession: pelada() }),
  },
  {
    nome: 'Passo 0 — já marcada: o caminho é abrir a lista',
    contrato: contrato({ activeSession: pelada(), isScheduled: true }),
  },
  {
    nome: 'Passo 0 — sem nuvem: o manual volta a ser o caminho',
    contrato: contrato({
      activeSession: pelada(),
      communities: [COMUNIDADE_LOCAL],
      primaryAction: 'manual',
    }),
  },
  {
    nome: 'Passo 0 — data no passado',
    contrato: contrato({
      activeSession: pelada(),
      scheduleError: 'Essa data já passou. Escolha hoje ou um dia à frente.',
    }),
  },
  {
    nome: 'Passo 0 — vagas mudadas na mão',
    contrato: contrato({ activeSession: pelada({ registrationCapacity: 14 }) }),
  },
  {
    nome: 'Passo 0 — nome vazio',
    contrato: contrato({
      activeSession: pelada({ name: '' }),
      validationErrors: { name: 'O nome da sessão é obrigatório.' },
    }),
  },
  {
    nome: 'Passo 1 — atletas, nenhum escolhido',
    contrato: contrato({
      activeSession: pelada(),
      wizardStep: 1,
      validationErrors: { players: 'Selecione pelo menos 4 atletas.' },
    }),
  },
  {
    nome: 'Passo 1 — atletas escolhidos',
    contrato: contrato({
      activeSession: pelada({ selectedPlayerIds: ELENCO.slice(0, 6).map((p) => p.id) }),
      wizardStep: 1,
    }),
  },
  {
    nome: 'Passo 2 — formato',
    contrato: contrato({
      activeSession: pelada({ selectedPlayerIds: ELENCO.slice(0, 6).map((p) => p.id) }),
      wizardStep: 2,
    }),
  },
  {
    nome: 'Passo 3 — o muro que travou a produção, agora com saída',
    contrato: contrato({
      activeSession: pelada({ selectedPlayerIds: ELENCO.slice(0, 4).map((p) => p.id) }),
      wizardStep: 3,
      validationErrors: { teamCount: 'Para 3 times, selecione pelo menos 9 jogadores.' },
    }),
  },
  {
    nome: 'Passo 4 — revisão',
    contrato: contrato({
      activeSession: pelada({ selectedPlayerIds: ELENCO.map((p) => p.id) }),
      wizardStep: 4,
    }),
  },
];

/** Um estado por vez, escolhido pela URL: `?i=3`. Sem isso, um estado que
 *  quebra derruba a bancada inteira e ela deixa de dizer qual foi. */
function indiceInicial(): number {
  const bruto = Number(new URLSearchParams(window.location.search).get('i'));
  return Number.isInteger(bruto) && bruto >= 0 && bruto < ESTADOS.length ? bruto : 0;
}

export function Bancada() {
  const [aberto, setAberto] = useState<string | null>(ESTADOS[indiceInicial()].nome);

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-1">
          <h1 className="text-xl font-black uppercase tracking-tight">Wizard · estados da tela</h1>
          <p className="text-sm text-base-content/60">
            Componente real, dados de mentira, contrato inerte. Um por vez porque o wizard é alto —
            toque no título para trocar. Só o servidor de desenvolvimento serve esta página.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2">
          {ESTADOS.map((estado) => (
            <button
              key={estado.nome}
              type="button"
              onClick={() => setAberto(estado.nome)}
              title={`?i=${ESTADOS.indexOf(estado)}`}
              className={`btn btn-xs ${aberto === estado.nome ? 'btn-primary' : 'btn-ghost border-base-300'}`}
            >
              {estado.nome.replace(/^Passo \d+ — /, '')}
            </button>
          ))}
        </nav>

        {ESTADOS.filter((estado) => estado.nome === aberto).map((estado) => (
          <section key={estado.nome} className="space-y-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {estado.nome}
            </h2>
            <div className="rounded-box border border-base-300/60 p-2">
              <MemoryRouter>
                <SessionWizard contract={estado.contrato} />
              </MemoryRouter>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
