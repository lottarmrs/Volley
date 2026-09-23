/**
 * Bancada de design da sessão ao vivo.
 *
 * Existe porque a sessão ao vivo fica atrás do AuthGuard como toda rota de
 * comunidade, e é a tela que o PRODUCT.md descreve como o cenário real —
 * celular na mão, entre um ponto e outro, uma mão só. Aqui o componente real
 * roda com dados de mentira.
 *
 * Só o servidor de desenvolvimento serve este arquivo. `vite build` emite
 * apenas o `index.html` da raiz, então nada daqui chega a produção.
 *
 * Endereço: http://localhost:3100/preview/aovivo.html
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import { SessionActiveView } from '../src/components/live/SessionActiveView';
import { buildSessionActiveViewContract } from '../src/application/screens/sessionActiveView/sessionActiveViewContract';
import { makeGame, makePlayer, makeTeam } from '../src/test/fixtures';
import { ToastProvider } from '../src/ui/common/ToastProvider';
import { AuthSessionContext, type AuthSessionContextValue } from '../src/app/auth/useAuthSession';
import type { FreePlayConfig, Game, PointEvent, Session } from '../src/types';

const NOMES = [
  'Ana Prado',
  'Bianca Ferraz Nascimento',
  'Caio Medeiros',
  'Duda Rocha',
  'Elias Tavares',
  'Fernanda Quintanilha Albuquerque',
  'Gustavo Sá',
  'Helena Vasconcelos',
  'Ivan Muniz',
  'Joana Cavalcanti Figueiredo',
  'Kleber Antunes',
  'Lara Monteiro',
];

const ELENCO = NOMES.map((nome, indice) =>
  makePlayer(`p${indice}`, {
    nome,
    apelido: nome.split(' ')[0],
    genero: indice % 3 === 0 ? 'F' : 'M',
  }),
);

const TIMES = [
  makeTeam(
    't1',
    's1',
    ELENCO.slice(0, 4).map((p) => p.id),
    { name: 'Vermelho' },
  ),
  makeTeam(
    't2',
    's1',
    ELENCO.slice(4, 8).map((p) => p.id),
    { name: 'Azul' },
  ),
  makeTeam(
    't3',
    's1',
    ELENCO.slice(8, 12).map((p) => p.id),
    { name: 'Verde' },
  ),
];

const CONFIG: FreePlayConfig = {
  type: 'free_play',
  teamCount: 3,
  maxPoints: 25,
  tieBreakMethod: 'win_by_2',
  hardPointCap: null,
  rotationSystem: 'winner_stays',
  maxConsecutiveGames: 3,
  initialCourtTeams: ['t1', 't2'],
  initialQueue: ['t3'],
  queuePolicy: 'fifo',
  rotationType: '6x0',
};

const SESSAO: Session = {
  id: 's1',
  communityId: 'c1',
  name: 'Pelada de quinta',
  date: '2026-09-24',
  status: 'active',
  type: 'free_play',
  selectedPlayerIds: ELENCO.map((p) => p.id),
  teamIds: ['t1', 't2', 't3'],
  config: CONFIG,
  createdAt: '2026-09-24T19:00:00.000Z',
  updatedAt: '2026-09-24T19:30:00.000Z',
};

const JOGO_EM_ANDAMENTO: Game = makeGame('g1', 's1', {
  teamAId: 't1',
  teamBId: 't2',
  scoreA: 18,
  scoreB: 21,
  status: 'active',
  sequenceNumber: 3,
});

const JOGOS_ANTERIORES: Game[] = [
  makeGame('g0a', 's1', {
    teamAId: 't1',
    teamBId: 't3',
    scoreA: 25,
    scoreB: 19,
    status: 'finished',
    sequenceNumber: 1,
  }),
  makeGame('g0b', 's1', {
    teamAId: 't2',
    teamBId: 't3',
    scoreA: 25,
    scoreB: 23,
    status: 'finished',
    sequenceNumber: 2,
  }),
];

const PONTOS: PointEvent[] = [];

/* A tela le a sessao de autenticacao para saber quem pode marcar ponto. A
   bancada injeta o contexto direto, em vez de instanciar o provider real com um
   cliente de mentira: menos peca falsa no caminho. */
const SESSAO_DE_AUTENTICACAO = {
  state: {
    kind: 'ready',
    userId: 'u-bancada',
    account: {
      state: 'ready',
      profile: { id: 'u-bancada', email: 'bancada@exemplo.com', role: 'user' },
      playerId: 'p0',
      username: 'bancada',
      requiresAal2: false,
    },
  },
  session: null,
  account: {
    state: 'ready',
    profile: { id: 'u-bancada', email: 'bancada@exemplo.com', role: 'user' },
    playerId: 'p0',
    username: 'bancada',
    requiresAal2: false,
  },
  authClient: {},
  retry: async () => {},
  completeUsername: async () => {},
  signOut: async () => {},
} as unknown as AuthSessionContextValue;

function Bloco({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
      <div className="rounded-box border border-base-300 p-2">{children}</div>
    </section>
  );
}

function Palco({
  nome,
  jogos,
  sessao,
}: {
  nome: string;
  jogos: Game[];
  sessao?: Partial<Session>;
}) {
  const [games, setGames] = useState<Game[]>(jogos);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>(PONTOS);
  const [gameReports, setGameReports] = useState<never[]>([]);
  const [activeSession, setActiveSession] = useState<Session>({ ...SESSAO, ...sessao });

  const contract = buildSessionActiveViewContract({
    activeSession,
    games,
    pointEvents,
    players: ELENCO,
    sessionTeams: TIMES,
    gameReports,
    currentDeviceId: 'dev-bancada',
    setGames,
    setPointEvents,
    setGameReports: setGameReports as never,
    setActiveSession,
    onExit: () => {},
    onFinishSession: () => {},
  });

  return (
    <Bloco nome={nome}>
      <SessionActiveView contract={contract} />
    </Bloco>
  );
}

export function Bancada() {
  return (
    <div className="min-h-screen bg-base-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="space-y-1 border-b border-base-300 pb-5">
          <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
            Sessão ao vivo
          </h1>
          <p className="text-sm text-base-content/60">
            Componente real, dados de mentira. Só o servidor de desenvolvimento serve esta página.
          </p>
        </header>

        <Palco
          nome="Jogo em andamento, placar apertado"
          jogos={[...JOGOS_ANTERIORES, JOGO_EM_ANDAMENTO]}
        />
        <Palco nome="Sessão recém-aberta, sem jogo" jogos={[]} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    <MemoryRouter>
      <AuthSessionContext.Provider value={SESSAO_DE_AUTENTICACAO}>
        <ToastProvider>
          <Bancada />
        </ToastProvider>
      </AuthSessionContext.Provider>
    </MemoryRouter>
  </StrictMode>,
);
