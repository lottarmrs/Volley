import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  buildRankingViewModel,
  getRankDisplay,
  rankingPositionLabels,
  type RankingSort,
} from '../../application/rankingViewModel';
import type { Game, Player, PointEvent, Session, Team } from '../../types';

interface RankingModuleProps {
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
}

export function RankingModule({
  players,
  games,
  pointEvents,
  teams,
  sessions,
}: RankingModuleProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RankingSort>('overall');

  const sortedRankings = buildRankingViewModel({
    players,
    games,
    pointEvents,
    teams,
    sessions,
    search,
    sort,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-surface p-4 rounded-xl border border-border">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
          <input
            type="text"
            placeholder="Buscar por jogador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {(['overall', 'winRate', 'points'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-lg border transition-all ${
                sort === s
                  ? 'bg-primary border-primary text-primary-content'
                  : 'bg-surface-muted border-border text-text-muted hover:text-base-content'
              }`}
            >
              {s === 'overall' ? 'Rating' : s === 'winRate' ? '% Vitória' : 'Pontos'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── MOBILE: Card-based ranking ─── */}
      <div className="lg:hidden space-y-2.5">
        {sortedRankings.map((p, index) => {
          return (
            <div
              key={p.player.id}
              className={`bg-base-200 border rounded-xl p-3.5 ${
                index < 3 ? 'border-accent/30' : 'border-base-300'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-sm font-black font-mono text-base-content/60 w-7 shrink-0 text-center">
                    {getRankDisplay(index)}
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-sm text-base-content truncate block">
                      {p.player.apelido || p.player.nome}
                    </span>
                    <span className="text-[10px] font-semibold text-base-content/50 uppercase">
                      {p.player.posicaoPrincipal
                        ? rankingPositionLabels[p.player.posicaoPrincipal] ||
                          p.player.posicaoPrincipal
                        : '--'}
                      {p.player.status.lesionado && (
                        <span className="ml-1.5 px-1 py-0.5 bg-error/15 text-error text-[8px] rounded uppercase font-bold">
                          Lesionado
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-black text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded text-sm shrink-0">
                  {p.overall}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-base-300/50 rounded-lg p-1.5">
                  <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                    Jogos
                  </span>
                  <span className="text-xs font-black font-mono text-base-content/80">
                    {p.stats.gamesPlayed}
                  </span>
                </div>
                <div className="bg-base-300/50 rounded-lg p-1.5">
                  <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                    Win%
                  </span>
                  <span className="text-xs font-black font-mono text-success">
                    {p.stats.winRate.toFixed(0)}%
                  </span>
                </div>
                <div className="bg-base-300/50 rounded-lg p-1.5">
                  <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                    Pontos
                  </span>
                  <span className="text-xs font-black font-mono text-accent">
                    {p.stats.totalPoints}
                  </span>
                </div>
                <div className="bg-base-300/50 rounded-lg p-1.5">
                  <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                    Bloq
                  </span>
                  <span className="text-xs font-black font-mono text-base-content/70">
                    {p.stats.blocks}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {sortedRankings.length === 0 && (
          <div className="py-16 text-center card bg-base-200 border border-base-300 border-dashed">
            <p className="text-base-content/50 uppercase text-xs font-bold italic">
              Nenhum atleta encontrado.
            </p>
          </div>
        )}
      </div>

      {/* ─── DESKTOP: Original table ─── */}
      <div className="hidden lg:block card card-border bg-base-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full text-xs text-left">
            <thead>
              <tr className="border-b border-base-300 font-bold text-base-content/60">
                <th className="p-4 w-16">Rank</th>
                <th className="p-4">Atleta</th>
                <th className="p-4">Posição</th>
                <th className="p-4 text-center">Jogos</th>
                <th className="p-4 text-center">Vitórias</th>
                <th className="p-4 text-center">% Vitórias</th>
                <th className="p-4 text-center">Aces</th>
                <th className="p-4 text-center">Bloqueios</th>
                <th className="p-4 text-center">Pontos Totais</th>
                <th className="p-4 text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {sortedRankings.map((p, index) => (
                <tr key={p.player.id}>
                  <td className="p-4 font-mono font-black text-base-content/70 text-sm">
                    {getRankDisplay(index)}
                  </td>
                  <td className="p-4 font-bold text-base-content">
                    {p.player.apelido || p.player.nome}
                    {p.player.status.lesionado && (
                      <span className="ml-2 px-1.5 py-0.5 bg-error/15 text-error text-[8px] rounded uppercase font-bold">
                        Lesionado
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-semibold text-base-content/60 uppercase text-[10px]">
                    {p.player.posicaoPrincipal
                      ? rankingPositionLabels[p.player.posicaoPrincipal] ||
                        p.player.posicaoPrincipal
                      : '--'}
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-base-content/70">
                    {p.stats.gamesPlayed}
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-success">
                    {p.stats.wins}
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-base-content">
                    {p.stats.winRate.toFixed(1)}%
                  </td>
                  <td className="p-4 text-center font-mono text-base-content/60">{p.stats.aces}</td>
                  <td className="p-4 text-center font-mono text-base-content/60">
                    {p.stats.blocks}
                  </td>
                  <td className="p-4 text-center font-mono font-black text-accent text-sm">
                    {p.stats.totalPoints}
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-mono font-black text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded text-xs">
                      {p.overall}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
