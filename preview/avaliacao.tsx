/**
 * Bancada de design da area de Avaliacao.
 *
 * Toda rota de comunidade passa pelo AuthGuard, e a lista depende de uma RPC que so
 * responde a quem avalia. Aqui os componentes reais rodam com dados de mentira, um
 * estado por bloco: a lista em cada estado e o formulario com um gateway falso.
 *
 * So o servidor de desenvolvimento serve este arquivo; `vite build` emite apenas o
 * `index.html` da raiz.
 *
 * Endereco: http://localhost:3100/preview/avaliacao.html
 */
import { StrictMode, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import { EvaluationRosterView } from '../src/components/community/evaluation/EvaluationRosterView';
import { CommunityEvaluationEditor } from '../src/components/player/CommunityEvaluationEditor';
import { buildEvaluationRosterView } from '../src/application/evaluationRosterViewModel';
import type { CommunityEvaluationGateway } from '../src/application/communityEvaluationUseCases';
import type { CommunityEvaluationRosterEntry } from '../src/types';

function atleta(
  playerId: string,
  name: string,
  extra: Partial<CommunityEvaluationRosterEntry> = {},
): CommunityEvaluationRosterEntry {
  return {
    playerId,
    name,
    nickname: null,
    position: 'ponteiro',
    hasAccount: true,
    myLastEvaluatedAt: null,
    isSelf: false,
    ...extra,
  };
}

const ELENCO: CommunityEvaluationRosterEntry[] = [
  atleta('a', 'Ana Prado', { position: 'levantador', myLastEvaluatedAt: '2026-09-22T20:00:00Z' }),
  atleta('b', 'Bianca Ferraz', { position: 'oposto' }),
  atleta('c', 'Caio Medeiros', { nickname: 'Caião', hasAccount: false }),
  atleta('d', 'Débora Lins', { position: 'central', myLastEvaluatedAt: '2026-09-18T20:00:00Z' }),
  atleta('e', 'Eduardo Vasconcelos de Albuquerque', { position: 'líbero', hasAccount: false }),
  atleta('f', 'Fernanda Rocha', { position: 'ponteiro' }),
];

const COMPLETO = ELENCO.map((e) => ({ ...e, myLastEvaluatedAt: '2026-09-24T20:00:00Z' }));

const LISTAS: Array<{
  nome: string;
  state: 'loading' | 'offline' | 'not_synced' | 'error' | 'ready';
  entries?: CommunityEvaluationRosterEntry[];
  errorMessage?: string;
}> = [
  { nome: 'Parcial', state: 'ready', entries: ELENCO },
  {
    nome: 'Com autoavaliação provisória',
    state: 'ready',
    entries: [atleta('eu', 'Matheus Lotta', { isSelf: true }), ...ELENCO.slice(0, 3)],
  },
  { nome: 'Completo', state: 'ready', entries: COMPLETO },
  { nome: 'Vazio', state: 'ready', entries: [] },
  { nome: 'Carregando', state: 'loading' },
  { nome: 'Sem conexão', state: 'offline' },
  { nome: 'Comunidade sem nuvem', state: 'not_synced' },
  {
    nome: 'Falhou',
    state: 'error',
    errorMessage: 'Não foi possível carregar os atletas. Verifique a conexão.',
  },
];

function gateway(
  opcoes: {
    canEvaluate?: boolean;
    own?: Record<string, number>;
    falha?: 'rede' | 'conflito';
  } = {},
): CommunityEvaluationGateway {
  let tentativas = 0;
  return {
    loadEditor: async (communityId, playerId) => ({
      community_id: communityId,
      player_id: playerId,
      authority_model: 'target',
      can_evaluate: opcoes.canEvaluate ?? true,
      can_manage_evaluators: false,
      rubric_version: 'v0-legacy-11',
      own_evaluation: opcoes.own
        ? { contribution_id: 'x', rubric_version: 'v0-legacy-11', dimensions: opcoes.own }
        : null,
      members: [],
    }),
    record: async () => {
      tentativas += 1;
      if (opcoes.falha === 'rede' && tentativas === 1) throw new Error('rede');
      if (opcoes.falha === 'conflito') throw { code: '40001' };
    },
    activatedCommunityIds: async () => [],
    activate: async () => undefined,
    setEvaluator: async () => undefined,
    listRoster: async () => [],
    listEvaluators: async () => [],
  };
}

const FORMULARIOS: Array<{
  nome: string;
  saveLabel?: string;
  gateway: CommunityEvaluationGateway;
}> = [
  {
    nome: 'Formulário — primeira avaliação',
    saveLabel: 'Salvar · próximo: Bianca',
    gateway: gateway(),
  },
  {
    nome: 'Formulário — revendo notas, com meio ponto',
    saveLabel: 'Salvar',
    gateway: gateway({ own: { saque: 7.5, recepcao: 6, defesa: 8, leituraDeJogo: 9 } }),
  },
  {
    nome: 'Formulário — falha de rede no primeiro envio (preencha uma nota e salve)',
    gateway: gateway({ falha: 'rede' }),
  },
  {
    nome: 'Formulário — conflito (preencha uma nota e salve)',
    gateway: gateway({ falha: 'conflito' }),
  },
  { nome: 'Formulário — quem não avalia', gateway: gateway({ canEvaluate: false }) },
];

const Bloco: FC<{ nome: string; children: ReactNode }> = ({ nome, children }) => (
  <section className="space-y-3">
    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
    {children}
  </section>
);

export function Bancada() {
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-base-100 px-4 py-8">
        <div className="mx-auto max-w-xl space-y-12">
          <header className="space-y-1 border-b border-base-300 pb-5">
            <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
              Avaliação · estados da tela
            </h1>
            <p className="text-sm text-base-content/60">
              Componentes reais, dados de mentira. Só o servidor de desenvolvimento serve esta
              página.
            </p>
          </header>

          {LISTAS.map((lista) => (
            <Bloco key={lista.nome} nome={`Lista — ${lista.nome}`}>
              <EvaluationRosterView
                state={lista.state}
                errorMessage={lista.errorMessage}
                view={lista.entries ? buildEvaluationRosterView(lista.entries) : undefined}
                canDesignate
                managementPath="/comunidades/c1/gestao"
                onOpen={() => undefined}
                onRetry={() => undefined}
              />
            </Bloco>
          ))}

          {FORMULARIOS.map((formulario, index) => (
            <Bloco key={formulario.nome} nome={formulario.nome}>
              <CommunityEvaluationEditor
                communityId="c1"
                playerId={`p${index}`}
                saveLabel={formulario.saveLabel}
                gateway={formulario.gateway}
                onSaved={() => undefined}
              />
            </Bloco>
          ))}
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
