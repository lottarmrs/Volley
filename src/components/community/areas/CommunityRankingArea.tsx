import { useState } from 'react';
import { Plus, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@app/appRoutes';
import { EmptyState } from '../../../ui/EmptyState';
import type {
  Community,
  CommunityRankingFilter,
  Game,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
} from '../../../types';
import { getCommunityRanking } from '../../../logic/community';
import { formatCommunityRankingText } from '../../../logic/shareFormatters';
import { ShareActions } from '../../share/ShareActions';

export function CommunityRankingArea({
  community,
  players,
  sessions,
  games,
  pointEvents,
  teams,
  sessionReports,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
}) {
  const [filter, setFilter] = useState<CommunityRankingFilter>('all');
  const ranking = getCommunityRanking({
    communityId: community.id,
    filter,
    players,
    sessions,
    games,
    pointEvents,
    teams,
    sessionReports,
  });
  const text = formatCommunityRankingText(community, ranking, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'Geral'],
            ['month', 'Mês'],
            ['last5', 'Últimas 5'],
            ['last10', 'Últimas 10'],
            ['season', 'Temporada'],
          ] as Array<[CommunityRankingFilter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn join-item btn-sm ${filter === id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ShareActions
        title={`Ranking - ${community.name}`}
        text={text}
        variant="menu"
        blocks={[
          { id: 'top3', label: 'Top 3', text: formatCommunityRankingText(community, ranking, 3) },
          { id: 'top5', label: 'Top 5', text: formatCommunityRankingText(community, ranking, 5) },
          { id: 'general', label: 'Geral', text },
        ]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ranking.rows.map((row, index) => (
          <div key={row.playerId} className="card card-border bg-base-200">
            <div className="card-body p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="badge badge-primary">#{index + 1}</span>
                  <h3 className="font-black mt-2">{row.playerName}</h3>
                  <p className="text-sm text-base-content/60">
                    {row.totalPoints} pts - {row.mvpCount} MVPs
                  </p>
                </div>
                <Trophy className="w-5 h-5 text-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span>
                  Presenca: <b>{row.presenceRate}%</b>
                </span>
                <span>
                  Vitorias: <b>{row.wins}</b>
                </span>
                <span>
                  Aces: <b>{row.aces}</b>
                </span>
                <span>
                  Bloqueios: <b>{row.blocks}</b>
                </span>
                <span>
                  Erros: <b>{row.errors || 0}</b>
                </span>
                <span>
                  Lances: <b>{row.highlights || 0}</b>
                </span>
                <span>
                  Aproveitamento: <b>{row.winRate}%</b>
                </span>
                <span>
                  Regularidade: <b>{row.regularity}</b>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {ranking.rows.length === 0 &&
        (filter === 'all' ? (
          <EmptyState
            icon={Trophy}
            size="compact"
            title="O ranking se escreve jogando"
            description="Cada ponto marcado numa pelada desta comunidade entra aqui: ataque, bloqueio, ace e vitória viram posição na tabela. Assim que a primeira sessão for encerrada, o elenco aparece ordenado."
          >
            <Link
              to={paths.sessaoNova(community.id)}
              className="btn btn-primary min-h-[48px] w-fit gap-2 px-6 font-black uppercase tracking-wider"
            >
              <Plus className="h-5 w-5" /> Marcar a primeira pelada
            </Link>
          </EmptyState>
        ) : (
          <div className="card card-border bg-base-200 border-dashed">
            <div className="card-body items-center gap-3 py-10 text-center">
              <Trophy className="h-8 w-8 text-base-content/30" />
              <p className="text-sm text-base-content/70">
                Nenhuma partida deste recorte ainda. Veja o ranking geral da comunidade.
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="btn btn-outline btn-sm min-h-[44px] px-5 font-bold uppercase tracking-wider"
              >
                Ver o geral
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
