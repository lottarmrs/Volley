/**
 * Bancada de design das áreas da comunidade.
 *
 * Existe porque toda rota sob /comunidades passa pelo AuthGuard: sem conta não
 * dá para olhar estas telas no navegador. Aqui os componentes reais rodam com
 * dados de mentira, uma área por bloco, para medir onde a largura quebra.
 *
 * Só o servidor de desenvolvimento serve este arquivo. `vite build` emite
 * apenas o `index.html` da raiz, então nada daqui chega a produção.
 *
 * Endereço: http://localhost:3100/preview/comunidade.html
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import { CommunityDataArea } from '../src/components/community/areas/CommunityDataArea';
import { CommunityLeaguesArea } from '../src/components/community/areas/CommunityLeaguesArea';
import { CommunityPresenceArea } from '../src/components/community/areas/CommunityPresenceArea';
import { CommunityRankingArea } from '../src/components/community/areas/CommunityRankingArea';
import { CommunityRosterTools } from '../src/components/community/areas/CommunityRosterTools';
import { makeGame, makePlayer, makeSession, makeTeam } from '../src/test/fixtures';
import type {
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  CommunityPresence,
  CommunityPresenceItem,
  Player,
} from '../src/types';
import type { CommunityPresenceApi } from '../src/application/screens/communitiesView/communitiesViewModel';
import { appOk } from '../src/application/appResult';

const COMUNIDADE_ID = 'c1';

const COMUNIDADE: Community = {
  id: COMUNIDADE_ID,
  name: 'Panelinha da Quinta',
  description: 'Vôlei misto, quadra de areia, toda quinta às 19h.',
  defaultLocation: 'Arena Beira-Mar, quadra 3',
  defaultDay: 'quinta',
  defaultStartTime: '19:00',
  defaultEndTime: '21:00',
  defaultFormat: 'free_play',
  archived: false,
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// Nomes longos de proposito: e onde a largura quebra primeiro.
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
];

const POSICOES = ['levantador', 'oposto', 'ponteiro', 'central', 'libero', 'all-rounder'] as const;

const ELENCO: Player[] = NOMES.map((nome, indice) =>
  makePlayer(`p${indice}`, {
    nome,
    apelido: nome.split(' ')[0],
    cloudId: `cloud-p${indice}`,
    communityIds: [COMUNIDADE_ID],
    posicaoPrincipal: POSICOES[indice % POSICOES.length],
    genero: indice % 3 === 0 ? 'F' : 'M',
    alturaCm: 170 + (indice % 5) * 4,
    status: {
      lesionado: indice === 4,
      limitacaoFisica: null,
      presencaFrequente: indice % 2 === 0,
    },
  }),
);

const SESSOES = [
  makeSession('s1', {
    communityId: COMUNIDADE_ID,
    name: 'Pelada de quinta',
    date: '2026-09-17',
    status: 'finished',
    selectedPlayerIds: ELENCO.slice(0, 8).map((p) => p.id),
  }),
  makeSession('s2', {
    communityId: COMUNIDADE_ID,
    name: 'Pelada de quinta',
    date: '2026-09-24',
    status: 'configured',
    selectedPlayerIds: ELENCO.slice(0, 6).map((p) => p.id),
  }),
];

const TIMES = [
  makeTeam(
    't1',
    's1',
    ELENCO.slice(0, 4).map((p) => p.id),
    { name: 'Time Vermelho' },
  ),
  makeTeam(
    't2',
    's1',
    ELENCO.slice(4, 8).map((p) => p.id),
    { name: 'Time Azul' },
  ),
];

const JOGOS = [
  makeGame('g1', 's1', {
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 21,
    scoreB: 18,
    status: 'finished',
  }),
  makeGame('g2', 's1', {
    teamAId: 't2',
    teamBId: 't1',
    scoreA: 21,
    scoreB: 15,
    status: 'finished',
  }),
];

const CAMPEONATO: Championship = {
  id: 'camp1',
  communityId: COMUNIDADE_ID,
  name: 'Liga de Primavera 2026',
  format: 'round_robin',
  classificationPoints: { win: 3, loss: 0 },
  recurrenceRule: { daysOfWeek: [4], time: '19:00', startDate: '2026-09-03', endDate: null },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const TIMES_DA_LIGA: ChampionshipTeam[] = [
  {
    id: 'ct1',
    championshipId: 'camp1',
    name: 'Os Cortadores da Beira-Mar',
    playerIds: ['p0', 'p1', 'p2'],
  },
  { id: 'ct2', championshipId: 'camp1', name: 'Bloqueio Duplo', playerIds: ['p3', 'p4', 'p5'] },
  { id: 'ct3', championshipId: 'camp1', name: 'Saque Viagem', playerIds: ['p6', 'p7', 'p8'] },
  { id: 'ct4', championshipId: 'camp1', name: 'Defesa de Areia', playerIds: ['p9', 'p0', 'p1'] },
];

const RODADAS: ChampionshipRound[] = [
  {
    id: 'r1',
    championshipId: 'camp1',
    round: 1,
    teamAId: 'ct1',
    teamBId: 'ct2',
    scheduledDate: '2026-09-03',
    skipped: false,
    sessionId: 's1',
  },
  {
    id: 'r2',
    championshipId: 'camp1',
    round: 1,
    teamAId: 'ct3',
    teamBId: 'ct4',
    scheduledDate: '2026-09-03',
    skipped: false,
  },
  {
    id: 'r3',
    championshipId: 'camp1',
    round: 2,
    teamAId: 'ct1',
    teamBId: 'ct3',
    scheduledDate: '2026-09-10',
    skipped: false,
  },
  {
    id: 'r4',
    championshipId: 'camp1',
    round: 2,
    teamAId: 'ct2',
    teamBId: 'ct4',
    scheduledDate: '2026-09-10',
    skipped: true,
  },
  {
    id: 'r5',
    championshipId: 'camp1',
    round: 3,
    teamAId: 'ct1',
    teamBId: 'ct4',
    scheduledDate: '2026-09-17',
    skipped: false,
  },
  {
    id: 'r6',
    championshipId: 'camp1',
    round: 3,
    teamAId: 'ct2',
    teamBId: 'ct3',
    scheduledDate: '2026-09-17',
    skipped: false,
  },
];

const PRESENCA: CommunityPresence = {
  communityId: COMUNIDADE_ID,
  date: '2026-09-24',
  updatedAt: '2026-09-23T12:00:00.000Z',
  items: ELENCO.slice(0, 7).map(
    (player, indice): CommunityPresenceItem => ({
      playerId: player.id,
      status: (['present', 'absent', 'maybe', 'unmarked'] as const)[indice % 4],
    }),
  ),
};

const nada = () => {};

const presenceApi: CommunityPresenceApi = {
  getPresence: () => PRESENCA,
  setPresenceStatus: nada,
  clearPresence: nada,
  selectFrequentPlayers: nada,
  useLastPresence: nada,
  addGuest: nada,
  getPresentPlayers: () => ELENCO.slice(0, 5),
};

function Bloco({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{nome}</h2>
      {children}
    </section>
  );
}

export function Bancada() {
  const [filtro, setFiltro] = useState<Parameters<typeof CommunityRosterTools>[0]['filter']>('all');

  return (
    <div className="min-h-screen bg-base-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="space-y-1 border-b border-base-300 pb-5">
          <h1 className="text-2xl font-black uppercase tracking-tight text-base-content">
            Comunidade · áreas
          </h1>
          <p className="text-sm text-base-content/60">
            Componentes reais, dados de mentira. Só o servidor de desenvolvimento serve esta página.
          </p>
        </header>

        <Bloco nome="Pessoas · ferramentas do elenco">
          <CommunityRosterTools
            community={COMUNIDADE}
            players={ELENCO}
            visiblePlayers={ELENCO}
            filter={filtro}
            onFilterChange={setFiltro}
            canManageMembers
            currentUserId="u1"
            isSupabaseConfigured={false}
            onCreatePlayer={nada}
            onLinkedPlayer={nada}
          />
        </Bloco>

        <Bloco nome="Sessões · presença">
          <CommunityPresenceArea
            community={COMUNIDADE}
            players={ELENCO}
            presenceApi={presenceApi}
            onCreateSession={nada}
          />
        </Bloco>

        <Bloco nome="Ligas">
          <CommunityLeaguesArea
            community={COMUNIDADE}
            players={ELENCO}
            games={JOGOS}
            pointEvents={[]}
            sessionTeams={TIMES}
            championships={[CAMPEONATO]}
            championshipTeams={TIMES_DA_LIGA}
            championshipRounds={RODADAS}
            canManage
            onCreateChampionship={() => appOk(null)}
            onMaterializeRound={() => appOk({ sessionId: 's1' })}
            onDeleteChampionship={nada}
            onRescheduleRound={() => appOk(null)}
            onSetRoundSkipped={() => appOk(null)}
            onUpdateChampionshipRecurrence={() => appOk(null)}
          />
        </Bloco>

        <Bloco nome="Desempenho · ranking">
          <CommunityRankingArea
            community={COMUNIDADE}
            players={ELENCO}
            sessions={SESSOES}
            games={JOGOS}
            pointEvents={[]}
            teams={TIMES}
            sessionReports={[]}
          />
        </Bloco>

        <Bloco nome="Gestão · dados">
          <CommunityDataArea
            community={COMUNIDADE}
            players={ELENCO}
            sessions={SESSOES}
            onUpdateCommunity={() => true}
            onDeleteCommunity={nada}
            onDuplicateCommunity={nada}
            onClearCommunityHistory={nada}
          />
        </Bloco>
      </div>
    </div>
  );
}

createRoot(document.getElementById('bancada') as HTMLElement).render(
  <StrictMode>
    {/* Alguma area usa Link/useNavigate por dentro: sem roteador o React quebra
        na montagem, e a bancada renderiza vazia. */}
    <MemoryRouter>
      <Bancada />
    </MemoryRouter>
  </StrictMode>,
);
