import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import type { Division, Player, Session } from '../src/types';
import type { SessionWizardModel } from '../src/application/screens/sessionWizard/sessionWizardModel';
import { peladaNextStep } from '../src/application/peladaNextStep';
import { markPeladaDefaults } from '../src/application/markPeladaDefaults';
import { PeladaNextStepCard } from '../src/components/session/PeladaNextStepCard';
import { MarkPeladaView } from '../src/components/session/MarkPeladaView';
import { QuickPeladaView } from '../src/components/session/QuickPeladaView';
import { SessionWizard } from '../src/components/session/SessionWizard';
import { makeFreePlayConfig, makePlayer, makeSession, makeTeam } from '../src/test/fixtures';
import '../src/index.css';

const NOMES = [
  'Rafa',
  'Bia',
  'Gustavo',
  'Camila',
  'Thiago',
  'Juliana',
  'Léo',
  'Marina',
  'Diego',
  'Paula',
  'Vinícius',
  'Larissa',
  'Maximiliano Albuquerque',
  'Tati',
];

const ELENCO: Player[] = NOMES.map((nome, i) =>
  makePlayer(`p${i + 1}`, {
    nome,
    apelido: nome,
    genero: i % 2 === 0 ? 'M' : 'F',
    communityIds: ['c1'],
  }),
);

const PELADA: Session = makeSession('s1', {
  communityId: 'c1',
  name: 'Terça Forte · ter 06/10',
  date: '2026-10-06',
  status: 'configured',
  type: 'free_play',
  selectedPlayerIds: ELENCO.slice(0, 10).map((p) => p.id),
  teamIds: [],
  config: makeFreePlayConfig(),
});

const DIVISAO: Division = {
  teams: [
    makeTeam('t1', 's1', ['p1', 'p2', 'p3', 'p4', 'p5']),
    makeTeam('t2', 's1', ['p6', 'p7', 'p8', 'p9', 'p10']),
  ],
  penalty: 1,
  score: 92,
};

const ETAPAS: Array<{ nome: string; input: Parameters<typeof peladaNextStep>[0] }> = [
  {
    nome: 'Lista ainda não aberta',
    input: { status: 'draft', windowStatus: null, confirmed: 0, capacity: 12, canManage: true },
  },
  {
    nome: 'Lista aberta, enchendo',
    input: { status: 'draft', windowStatus: 'OPEN', confirmed: 7, capacity: 12, canManage: true },
  },
  {
    nome: 'Lista aberta, vista por quem joga',
    input: { status: 'draft', windowStatus: 'OPEN', confirmed: 7, capacity: 12, canManage: false },
  },
  {
    nome: 'Lista fechada',
    input: {
      status: 'draft',
      windowStatus: 'LOCKED',
      confirmed: 12,
      capacity: 12,
      canManage: true,
    },
  },
  {
    nome: 'Times sorteados',
    input: {
      status: 'teams_generated',
      windowStatus: 'LOCKED',
      confirmed: 12,
      capacity: 12,
      canManage: true,
    },
  },
  {
    nome: 'Rolando',
    input: {
      status: 'active',
      windowStatus: 'LOCKED',
      confirmed: 12,
      capacity: 12,
      canManage: true,
      gameNumber: 4,
    },
  },
  {
    nome: 'Encerrada',
    input: {
      status: 'finished',
      windowStatus: 'LOCKED',
      confirmed: 12,
      capacity: 12,
      canManage: true,
      mvpName: 'Camila',
    },
  },
];

function modelo(extra: Partial<SessionWizardModel>): SessionWizardModel {
  return {
    activeSession: PELADA,
    players: ELENCO,
    communities: [],
    canEditGuestDetails: false,
    wizardStep: 2,
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
    canSchedule: false,
    primaryAction: 'next',
    isScheduled: true,
    scheduleError: null,
    stepLabels: ['Pelada', 'Atletas', 'Formato', 'Regras', 'Revisão', 'Times', 'Tabela'],
    positionLabels: {
      levantador: 'Levantador',
      ponteiro: 'Ponteiro',
      oposto: 'Oposto',
      central: 'Central',
      libero: 'Líbero',
      'all-rounder': 'Curinga',
    },
    positionOrder: ['levantador', 'ponteiro', 'oposto', 'central', 'libero', 'all-rounder'],
    ...extra,
  } as SessionWizardModel;
}

function Secao({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
      <div className="rounded-box border border-base-300/60 p-4">{children}</div>
    </section>
  );
}

const nada = () => {};

export function Bancada() {
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-base-100 text-base-content">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
          <header className="space-y-1">
            <h1 className="text-xl font-black uppercase tracking-tight">Pelada · fluxo novo</h1>
            <p className="text-sm text-base-content/60">
              Componentes reais, dados de mentira. Só o servidor de desenvolvimento serve esta
              página.
            </p>
          </header>

          <Secao nome="Marcar pelada">
            <MarkPeladaView
              communityName="Terça Forte"
              defaults={markPeladaDefaults(
                { defaultDay: 'Terça', defaultStartTime: '20:00', defaultLocation: 'Arena Pro' },
                new Date(),
              )}
              today="2026-10-01"
              busy={false}
              error={null}
              onSubmit={nada}
              onCancel={nada}
            />
          </Secao>

          {ETAPAS.map((etapa) => (
            <div key={etapa.nome}>
              <Secao nome={`Próximo passo · ${etapa.nome}`}>
                <PeladaNextStepCard
                  step={peladaNextStep(etapa.input)}
                  busy={false}
                  onAction={nada}
                />
              </Secao>
            </div>
          ))}

          <Secao nome="Pelada rápida">
            <QuickPeladaView
              communities={[
                { id: 'c1', name: 'Terça Forte' },
                { id: 'c2', name: 'Domingo na Praia' },
              ]}
              communityId="c1"
              onCommunityChange={nada}
              roster={ELENCO}
              busy={false}
              error={null}
              onSubmit={nada}
              onCancel={nada}
            />
          </Secao>

          <Secao nome="Sortear · formato">
            <SessionWizard
              firstStep={2}
              title={`Sortear · ${PELADA.name}`}
              exitLabel="Voltar para a pelada"
              contract={{ model: modelo({ wizardStep: 2 }), dispatch: async () => {} }}
            />
          </Secao>

          <Secao nome="Sortear · times">
            <SessionWizard
              firstStep={2}
              title={`Sortear · ${PELADA.name}`}
              exitLabel="Voltar para a pelada"
              contract={{
                model: modelo({ wizardStep: 5, bestDivisions: [DIVISAO] }),
                dispatch: async () => {},
              }}
            />
          </Secao>
        </div>
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <Bancada />
  </StrictMode>,
);
