/**
 * Bancada de design da tela de inscrição.
 *
 * Existe porque toda rota de comunidade passa pelo AuthGuard: sem conta não dá
 * para olhar a tela no navegador, e estados como "carregando" e "falhou" não
 * aparecem nem com conta. Aqui o componente real roda com dados de mentira, um
 * estado por bloco.
 *
 * Só o servidor de desenvolvimento serve este arquivo. `vite build` emite
 * apenas o `index.html` da raiz, então nada daqui chega a produção.
 *
 * Endereço: http://localhost:3100/preview/inscricao.html
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { RegistrationBoardView } from '../src/components/session/RegistrationBoardView';
import type { RegistrationBoardApi } from '../src/hooks/useRegistrationBoard';
import { makePlayer } from '../src/test/fixtures';
import type { Player, RegistrationBoard } from '../src/types';

function atributos(base: number) {
  return {
    saque: base,
    recepcao: base + 1,
    levantamento: base - 1,
    ataque: base + 2,
    bloqueio: base,
    defesa: base + 1,
    velocidade: base,
    resistencia: base,
    leituraDeJogo: base + 1,
    regularidade: base,
    controleEmocional: base,
  };
}

const ELENCO: Player[] = [
  makePlayer('a', {
    atributos: atributos(8),
    cloudId: 'cloud-a',
    nome: 'Ana Prado',
    posicaoPrincipal: 'levantador',
  }),
  makePlayer('b', {
    atributos: atributos(7),
    cloudId: 'cloud-b',
    nome: 'Bianca Ferraz',
    posicaoPrincipal: 'oposto',
  }),
  makePlayer('c', {
    atributos: atributos(6),
    cloudId: 'cloud-c',
    nome: 'Caio Medeiros',
    posicaoPrincipal: 'ponteiro',
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: false },
  }),
  makePlayer('d', {
    atributos: atributos(9),
    cloudId: 'cloud-d',
    nome: 'Duda Rocha',
    posicaoPrincipal: 'central',
  }),
  makePlayer('e', {
    atributos: atributos(5),
    cloudId: 'cloud-e',
    nome: 'Elias Tavares',
    posicaoPrincipal: 'libero',
  }),
  makePlayer('f', {
    atributos: atributos(7),
    cloudId: 'cloud-f',
    nome: 'Fernanda Quintanilha',
    posicaoPrincipal: 'ponteiro',
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: false },
  }),
  makePlayer('g', {
    atributos: atributos(4),
    cloudId: 'cloud-g',
    nome: 'Gustavo Sá',
    posicaoPrincipal: 'central',
  }),
  // Fora da janela: aparecem no seletor de incluir de quem organiza.
  makePlayer('h', {
    cloudId: 'cloud-h',
    nome: 'Helena Vasconcelos',
    posicaoPrincipal: 'levantador',
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: false },
  }),
  makePlayer('i', {
    cloudId: 'cloud-i',
    nome: 'Ivan Muniz',
    posicaoPrincipal: 'oposto',
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: false },
  }),
];

function entrada(
  indice: number,
  status: 'CONFIRMED' | 'WAITLISTED',
  posicao: number | null,
  pagamento: { paidAt?: string | null; paymentLapsedAt?: string | null } = {},
) {
  const letra = 'abcdefg'[indice];
  return {
    entryId: `e-${letra}`,
    playerId: `cloud-${letra}`,
    status,
    queuePosition: posicao,
    source: indice === 3 ? ('ORGANIZER_ADDED' as const) : ('SELF_JOIN' as const),
    joinedAt: `2026-09-22T12:0${indice}:00.000Z`,
    paidAt: pagamento.paidAt ?? null,
    paymentLapsedAt: pagamento.paymentLapsedAt ?? null,
  };
}

function quadro(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-session',
    status: 'OPEN',
    revision: 4,
    capacity: 4,
    confirmedCount: 4,
    waitlistedCount: 3,
    paymentDueAt: null,
    paidCount: 0,
    viewerCanManage: false,
    viewerPlayerId: 'cloud-e',
    viewerEntryStatus: 'WAITLISTED',
    viewerQueuePosition: 1,
    viewerPaidAt: null,
    pendingDeadlineCut: null,
    entries: [
      entrada(0, 'CONFIRMED', null),
      entrada(1, 'CONFIRMED', null),
      entrada(2, 'CONFIRMED', null),
      entrada(3, 'CONFIRMED', null),
      entrada(4, 'WAITLISTED', 1),
      entrada(5, 'WAITLISTED', 2),
      entrada(6, 'WAITLISTED', 3),
    ],
    ...overrides,
  };
}

const nada = async () => {};

function api(overrides: Partial<RegistrationBoardApi> = {}): RegistrationBoardApi {
  return {
    board: quadro(),
    loading: false,
    busy: false,
    error: null,
    open: nada,
    join: nada,
    leave: nada,
    addAthlete: nada,
    removeAthlete: nada,
    changeCapacity: nada,
    setOpen: nada,
    reload: nada,
    markPaid: nada,
    setPaymentDue: nada,
    boostReserve: nada,
    applyDeadline: nada,
    ...overrides,
  };
}

const ESTADOS: { nome: string; api: RegistrationBoardApi; canOpen?: boolean }[] = [
  {
    nome: 'Atleta fora, com vaga sobrando',
    api: api({
      board: quadro({
        capacity: 12,
        confirmedCount: 4,
        waitlistedCount: 0,
        viewerEntryStatus: null,
        viewerQueuePosition: null,
        viewerPlayerId: 'cloud-x',
        entries: [
          entrada(0, 'CONFIRMED', null),
          entrada(1, 'CONFIRMED', null),
          entrada(2, 'CONFIRMED', null),
          entrada(3, 'CONFIRMED', null),
        ],
      }),
    }),
  },
  {
    nome: 'Atleta confirmado, lista cheia com reserva',
    api: api({
      board: quadro({
        viewerPlayerId: 'cloud-b',
        viewerEntryStatus: 'CONFIRMED',
        viewerQueuePosition: null,
      }),
    }),
  },
  { nome: 'Atleta na reserva, primeiro da fila', api: api() },
  {
    nome: 'Atleta na reserva, terceiro da fila',
    api: api({ board: quadro({ viewerPlayerId: 'cloud-g', viewerQueuePosition: 3 }) }),
  },
  {
    nome: 'Quem organiza',
    api: api({
      board: quadro({
        viewerCanManage: true,
        viewerPlayerId: 'cloud-a',
        viewerEntryStatus: 'CONFIRMED',
        viewerQueuePosition: null,
      }),
    }),
  },
  {
    nome: 'Inscrição fechada',
    api: api({
      board: quadro({ status: 'CLOSED', viewerEntryStatus: null, viewerQueuePosition: null }),
    }),
  },
  {
    nome: 'Lista travada para o sorteio',
    api: api({ board: quadro({ status: 'LOCKED', viewerCanManage: true }) }),
  },
  {
    nome: 'Erro da última ação, com a lista na tela',
    api: api({ error: 'A lista mudou enquanto você olhava. Atualize e tente de novo.' }),
  },
  { nome: 'Carregando', api: api({ board: null, loading: true }) },
  {
    nome: 'A leitura falhou',
    api: api({ board: null, error: 'Não foi possível carregar a inscrição. Tente de novo.' }),
  },
  { nome: 'Sem janela — o atleta espera', api: api({ board: null }) },
  { nome: 'Sem janela — quem organiza abre', api: api({ board: null }), canOpen: true },
];

export function Bancada() {
  return (
    <div className="min-h-screen bg-base-100 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-1 border-b border-base-300 pb-5">
          <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
            Inscrição · estados da tela
          </h1>
          <p className="text-sm text-base-content/60">
            Componente real, dados de mentira. Só o servidor de desenvolvimento serve esta página.
          </p>
        </header>

        {ESTADOS.map((estado) => (
          <section key={estado.nome} className="space-y-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {estado.nome}
            </h2>
            <RegistrationBoardView
              api={estado.api}
              players={ELENCO}
              sessionName="Pelada de quinta"
              sessionDate="2026-09-24"
              canOpen={estado.canOpen}
            />
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
