import React, { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Share2, Copy,
  History as HistoryIcon, Activity, Trophy, Zap, BarChart3, Users, Trash2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import {
  Session, Game, PointEvent, Team, Player, SessionReport, TournamentConfig
} from '../../types';
import { calculateTeamSessionStats, calculatePlayerScoringRanking } from '../../logic/match';
import { generateSessionReport } from '../../logic/reports';
import { formatSessionReportForWhatsApp, openWhatsAppShare, copyToClipboard } from '../../logic/exporters';
import {
  calculateTournamentStandings,
  calculateTournamentMVP,
  getHighestScoreMatch,
  getMostBalancedMatch,
  getLongestWinStreak,
  getFinalStandingsKnockout
} from '../../logic/tournament';
import { TournamentBracket } from '../tournament/TournamentBracket';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryViewProps {
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  players: Player[];
  sessionReports: SessionReport[];
  selectedHistorySessionId: string | null;
  setSelectedHistorySessionId: (id: string | null) => void;
  onDeleteSession: (id: string) => void;
  onBackToDashboard: () => void;
  initialTab?: HistoryTab;
  hideTabs?: boolean;
}

type HistoryTab = 'sessions' | 'stats';

// ─── Tooltip shared style ─────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-strong border border-border-strong rounded-lg p-3 text-[10px]">
      <p className="font-bold uppercase text-text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono font-bold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const HistoryView = ({
  sessions, games, pointEvents, teams, players,
  sessionReports, selectedHistorySessionId, setSelectedHistorySessionId, onDeleteSession, onBackToDashboard,
  initialTab, hideTabs
}: HistoryViewProps) => {
  const [tab, setTab] = useState<HistoryTab>(initialTab || 'sessions');
  const selectedSession = selectedHistorySessionId
    ? sessions.find(s => s.id === selectedHistorySessionId)
    : null;

  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        games={games}
        pointEvents={pointEvents}
        teams={teams}
        players={players}
        sessionReports={sessionReports}
        onDeleteSession={onDeleteSession}
        onBack={() => setSelectedHistorySessionId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - only show if tabs are not hidden (meaning it's not a standalone page) */}
      {!hideTabs && (
        <div className="flex items-center justify-between">
          <button 
            type="button"
            onClick={() => {
              onBackToDashboard();
            }} 
            className="flex items-center gap-2 text-text-muted hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-bold uppercase text-xs">Voltar</span>
          </button>
          <h2 className="text-xl font-black uppercase tracking-tight">Histórico de Sessões</h2>
          <div className="w-16" />
        </div>
      )}

      {/* Tabs */}
      {!hideTabs && (
        <div className="flex gap-1 p-1 bg-surface-muted rounded-xl border border-border">
          {([['sessions', 'Sessões', <HistoryIcon className="w-3.5 h-3.5" />],
             ['stats',    'Estatísticas', <BarChart3 className="w-3.5 h-3.5" />]] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as HistoryTab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${tab === id ? 'bg-surface-strong text-white' : 'text-text-muted hover:text-white'}`}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      )}

      {tab === 'sessions' ? (
        <SessionList
          sessions={sessions}
          games={games}
          onSelect={setSelectedHistorySessionId}
        />
      ) : (
        <GlobalStats
          sessions={sessions}
          games={games}
          pointEvents={pointEvents}
          teams={teams}
          players={players}
        />
      )}
    </div>
  );
};

// ─── Session list ─────────────────────────────────────────────────────────────

function SessionList({ sessions, games, onSelect }: {
  sessions: Session[];
  games: Game[];
  onSelect: (id: string) => void;
}) {
  const finished = sessions
    .filter(s => s.status === 'finished')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (finished.length === 0) {
    return (
      <div className="text-center py-20 card card-border border-dashed bg-base-200">
        <p className="text-base-content/60 uppercase text-xs font-bold italic">Nenhuma sessão registrada ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {finished.map(s => (
        <div
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="card card-border bg-base-200 p-5 rounded-xl flex flex-row items-center justify-between group hover:border-accent/50 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center">
              {s.type === 'tournament' ? (
                <Trophy className="w-5 h-5 text-primary" />
              ) : (
                <Calendar className="w-5 h-5 text-text-muted" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-white uppercase text-sm">{s.name}</h3>
              <div className="flex gap-2 text-[9px] items-center text-text-muted font-mono uppercase">
                <span>{new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                <span>•</span>
                <span>{s.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[8px] font-black text-text-muted uppercase">Partidas</p>
              <p className="text-lg font-black font-mono text-white">
                {games.filter(g => g.sessionId === s.id && g.status === 'finished').length}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Global stats & evolution charts ─────────────────────────────────────────

function GlobalStats({ sessions, games, pointEvents, teams, players }: {
  sessions: Session[]; games: Game[]; pointEvents: PointEvent[];
  teams: Team[]; players: Player[];
}) {
  const CREDITED = ['attack', 'block', 'serve_ace', 'defense_counterattack', 'tip'];
  const finishedSessionIds = useMemo(
    () => new Set(sessions.filter(s => s.status === 'finished').map(s => s.id)),
    [sessions]
  );
  const registeredGames = useMemo(
    () => games.filter(g => g.status === 'finished' && finishedSessionIds.has(g.sessionId)),
    [games, finishedSessionIds]
  );
  const registeredGameIds = useMemo(
    () => new Set(registeredGames.map(g => g.id)),
    [registeredGames]
  );
  const registeredPointEvents = useMemo(
    () => pointEvents.filter(p => registeredGameIds.has(p.gameId)),
    [pointEvents, registeredGameIds]
  );

  // Points per player across all sessions (top 10)
  const topScorers = useMemo(() => {
    const map: Record<string, number> = {};
    registeredPointEvents.forEach(p => {
      if (p.playerId && CREDITED.includes(p.reason || '')) {
        map[p.playerId] = (map[p.playerId] || 0) + 1;
      }
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, pts]) => ({
        name: players.find(p => p.id === id)?.apelido || players.find(p => p.id === id)?.nome?.split(' ')[0] || '—',
        pts,
      }));
  }, [registeredPointEvents, players]);

  // Sessions over time: games played + points scored
  const sessionsData = useMemo(() => {
    return sessions
      .filter(s => s.status === 'finished')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(s => {
        const sg = registeredGames.filter(g => g.sessionId === s.id);
        const sp = registeredPointEvents.filter(p => sg.some(g => g.id === p.gameId));
        const label = new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return { label, jogos: sg.length, pontos: sp.length };
      });
  }, [sessions, registeredGames, registeredPointEvents]);

  // Win rate per player (among players with ≥ 3 games)
  const playerWinRates = useMemo(() => {
    return players
      .map(player => {
        const playerTeamIds = teams.filter(t => t.playerIds.includes(player.id)).map(t => t.id);
        const pg = registeredGames.filter(g =>
          (playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId))
        );
        if (pg.length < 3) return null;
        const wins = pg.filter(g => {
          const isA = playerTeamIds.includes(g.teamAId);
          return isA ? g.winnerTeamId === g.teamAId : g.winnerTeamId === g.teamBId;
        }).length;
        return {
          name: player.apelido || player.nome.split(' ')[0],
          winRate: Math.round((wins / pg.length) * 100),
          games: pg.length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.winRate - a!.winRate)
      .slice(0, 8) as { name: string; winRate: number; games: number }[];
  }, [players, teams, registeredGames]);

  const COLORS = ['#F97316', '#2563EB', '#14B8A6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  if (sessions.filter(s => s.status === 'finished').length === 0) {
    return (
      <div className="text-center py-20 card card-border border-dashed bg-base-200">
        <p className="text-base-content/60 uppercase text-xs font-bold italic">Sem dados suficientes para gráficos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Sessões', val: sessions.filter(s => s.status === 'finished').length },
          { label: 'Partidas', val: registeredGames.length },
          { label: 'Pontos', val: registeredPointEvents.filter(p => CREDITED.includes(p.reason || '')).length },
          { label: 'Atletas', val: players.filter(p => p.ativo).length },
        ].map(s => (
          <div key={s.label} className="card card-border bg-base-200 p-4 rounded-xl text-center">
            <p className="text-[8px] font-black text-base-content/60 uppercase mb-1">{s.label}</p>
            <p className="text-xl font-black font-mono text-white">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Top scorers bar chart */}
      {topScorers.length > 0 && (
        <div className="card card-border bg-base-200 p-6 rounded-xl min-w-0 overflow-hidden">
          <h3 className="text-[10px] font-black uppercase text-accent mb-6 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> Top Artilheiros (todos os tempos)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topScorers} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="pts" name="Pontos" radius={[4, 4, 0, 0]}>
                {topScorers.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sessions evolution */}
      {sessionsData.length >= 2 && (
        <div className="card card-border bg-base-200 p-6 rounded-xl min-w-0 overflow-hidden">
          <h3 className="text-[10px] font-black uppercase text-base-content/60 mb-6 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Evolução por Sessão
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={sessionsData} margin={{ top: 0, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9, textTransform: 'uppercase', color: '#9ca3af' }} />
              <Line type="monotone" dataKey="jogos" name="Jogos" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
              <Line type="monotone" dataKey="pontos" name="Pontos" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Win rate bar chart */}
      {playerWinRates.length >= 2 && (
        <div className="card card-border bg-base-200 p-6 rounded-xl min-w-0 overflow-hidden">
          <h3 className="text-[10px] font-black uppercase text-base-content/60 mb-6 flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-accent" /> Taxa de Vitória por Atleta (mín. 3 jogos)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={playerWinRates} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 40 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="winRate" name="Win Rate %" radius={[0, 4, 4, 0]}>
                {playerWinRates.map((p, i) => (
                  <Cell key={i} fill={p.winRate >= 60 ? '#10b981' : p.winRate >= 40 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Session detail ───────────────────────────────────────────────────────────

function SessionDetailView({ session, games, pointEvents, teams, players, sessionReports, onDeleteSession, onBack }: {
  session: Session; games: Game[]; pointEvents: PointEvent[];
  teams: Team[]; players: Player[]; sessionReports: SessionReport[];
  onDeleteSession: (id: string) => void;
  onBack: () => void;
}) {
  const report = sessionReports.find(r => r.sessionId === session.id);

  const getReportText = () => {
    const r = report || generateSessionReport(
      session,
      games.filter(g => g.sessionId === session.id),
      pointEvents.filter(p => p.sessionId === session.id),
      teams.filter(t => t.sessionId === session.id),
      players
    );
    return formatSessionReportForWhatsApp(r);
  };

  const sessPoints   = pointEvents.filter(p => games.some(g => g.id === p.gameId && g.sessionId === session.id));
  const ranking      = calculatePlayerScoringRanking(sessPoints);
  const sessionGames = games.filter(g => g.sessionId === session.id && g.status === 'finished');
  const sessionTeams = teams.filter(t => t.sessionId === session.id);
  const teamStats    = calculateTeamSessionStats(sessionGames, session.teamIds);

  const standings = useMemo(() => {
    if (session.type !== 'tournament') return null;
    const cfg = session.config as TournamentConfig;
    const baseStandings = calculateTournamentStandings(
      games.filter(g => g.sessionId === session.id),
      session.teamIds,
      cfg?.classificationPoints || { win: 3, loss: 0 }
    );
    if (cfg?.format === 'knockout' || cfg?.format === 'groups_knockout') {
      return getFinalStandingsKnockout(
        games.filter(g => g.sessionId === session.id),
        sessionTeams,
        baseStandings
      );
    }
    return baseStandings;
  }, [session, games, sessionTeams]);

  const format = session.config?.type === 'tournament' ? (session.config as any).format : 'round_robin';
  const groups = (session.config as any)?.groups || [];

  const groupA = groups.find((g: any) => g.id === 'A');
  const groupB = groups.find((g: any) => g.id === 'B');

  const standingsA = useMemo(() => {
    if (session.type !== 'tournament' || (format !== 'groups_knockout' && format !== 'group_stage') || !groupA) return [];
    const cfg = session.config as TournamentConfig;
    return calculateTournamentStandings(
      games.filter(g => g.sessionId === session.id && g.groupId === 'A'),
      groupA.teamIds,
      cfg?.classificationPoints || { win: 3, loss: 0 }
    );
  }, [session, games, groupA, format]);

  const standingsB = useMemo(() => {
    if (session.type !== 'tournament' || (format !== 'groups_knockout' && format !== 'group_stage') || !groupB) return [];
    const cfg = session.config as TournamentConfig;
    return calculateTournamentStandings(
      games.filter(g => g.sessionId === session.id && g.groupId === 'B'),
      groupB.teamIds,
      cfg?.classificationPoints || { win: 3, loss: 0 }
    );
  }, [session, games, groupB, format]);

  const TEAM_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const getTeamColor = (teamId: string) => {
    const idx = sessionTeams.findIndex(t => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length];
  };

  const mvp = useMemo(() => {
    if (session.type !== 'tournament' || !standings) return null;
    return calculateTournamentMVP(sessPoints, sessionTeams, players, standings);
  }, [session, sessPoints, sessionTeams, players, standings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          type="button"
          onClick={() => {
            onBack();
          }} 
          className="flex items-center gap-2 text-text-muted hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-bold uppercase text-xs">Voltar</span>
        </button>
        <h2 className="text-xl font-black uppercase tracking-tight line-clamp-1 px-4">{session.name}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => openWhatsAppShare(getReportText())}
            className="p-2 bg-[#25D366]/20 text-[#25D366] rounded-lg hover:bg-[#25D366]/30 transition-all border border-[#25D366]/30"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={async () => { const ok = await copyToClipboard(getReportText()); if (ok) alert('Resumo copiado!'); }}
            className="p-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all border border-white/10"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Excluir este historico? Esta acao remove torneio, jogos, pontos e relatorios.')) {
                onDeleteSession(session.id);
              }
            }}
            className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all border border-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total de Jogos', val: sessionGames.length },
            { label: 'Pontos Marcados', val: sessPoints.length },
            { label: 'Times Ativos', val: sessionTeams.length },
            { label: 'MVP da Noite', val: ranking[0] ? (players.find(x => x.id === ranking[0].playerId)?.nome.split(' ')[0] || '---') : '---' },
          ].map(st => (
            <div key={st.label} className="card card-border bg-base-200 p-4 rounded-xl text-center">
              <p className="text-[8px] font-black text-base-content/60 uppercase mb-1">{st.label}</p>
              <p className="text-lg font-black font-mono text-white">{st.val}</p>
            </div>
          ))}
        </div>

        <div className="card card-border bg-base-200 p-6 rounded-xl">
          <h3 className="text-xs font-black uppercase text-accent mb-4 border-b border-accent/10 pb-2">Dados e regras</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] uppercase">
            <div>
              <p className="text-text-muted font-black">Formato</p>
              <p className="text-white font-black">
                {session.type === 'tournament'
                  ? `Torneio - ${
                      format === 'round_robin' ? 'Todos contra todos' :
                      format === 'double_round_robin' ? 'Turno e Returno' :
                      format === 'knockout' ? 'Mata-mata' :
                      format === 'group_stage' ? 'Fase de Grupos' :
                      format === 'groups_knockout' ? 'Grupos + Mata-mata' : 'Torneio'
                    }`
                  : 'Jogo Livre'}
              </p>
            </div>
            <div>
              <p className="text-text-muted font-black">Regra</p>
              <p className="text-white font-black">
                ate {session.config?.maxPoints || 15} pontos - {session.config?.tieBreakMethod === 'direct_3' ? '3 direto' : 'Vai a 2'}
              </p>
            </div>
            <div>
              <p className="text-text-muted font-black">Local</p>
              <p className="text-white font-black">{session.location || 'Nao informado'}</p>
            </div>
            <div>
              <p className="text-text-muted font-black">Observacoes</p>
              <p className="text-white font-black">{session.notes || 'Sem observacoes'}</p>
            </div>
          </div>
        </div>

        {session.type === 'tournament' && (format === 'knockout' || format === 'groups_knockout') && (
          <TournamentBracket games={games.filter(g => g.sessionId === session.id)} teams={sessionTeams} />
        )}

        {/* Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card card-border bg-base-200 p-6 rounded-xl">
            <h3 className="text-xs font-black uppercase text-accent mb-4 border-b border-accent/10 pb-2">Artilheiros</h3>
            <div className="space-y-3">
              {ranking.slice(0, 5).map((rank, i) => {
                const p = players.find(x => x.id === rank.playerId);
                const aces   = sessPoints.filter(pt => pt.playerId === rank.playerId && pt.reason === 'serve_ace').length;
                const blocks = sessPoints.filter(pt => pt.playerId === rank.playerId && pt.reason === 'block').length;
                return (
                  <div key={rank.playerId} className="flex justify-between items-center p-2 bg-white/5 rounded">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-muted text-[10px] w-4">{i + 1}º</span>
                      <span className="text-xs font-bold text-white uppercase">{p?.nome || 'Atleta'}</span>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="flex gap-1">
                        {aces   > 0 && <span className="text-[8px] font-black bg-orange-500/20 text-orange-400 px-1 rounded">ACE ×{aces}</span>}
                        {blocks > 0 && <span className="text-[8px] font-black bg-blue-500/20 text-blue-400 px-1 rounded">BLK ×{blocks}</span>}
                      </div>
                      <span className="font-mono font-black text-white">{rank.points} pts</span>
                    </div>
                  </div>
                );
              })}
              {ranking.length === 0 && (
                <div className="text-center py-8 text-xs text-text-muted italic">NENHUM PONTO REGISTRADO</div>
              )}
            </div>
          </div>

          {session.type === 'tournament' && standings ? (
            <div className="card card-border bg-base-200 p-6 rounded-xl">
              <h3 className="text-xs font-black uppercase text-primary mb-4 border-b border-primary/10 pb-2">Classificação Final</h3>
              <div className="space-y-3">
                {standings.map((t, i) => {
                  const team = sessionTeams.find(st => st.id === t.teamId);
                  return (
                    <div key={t.teamId} className="flex justify-between items-center p-2 bg-white/5 rounded text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className={`font-black ${i === 0 ? 'text-accent' : 'text-text-muted'}`}>{i + 1}º</span>
                        <span className="text-xs font-bold text-white uppercase">{team?.name || 'Time'}</span>
                        {t.tieBreakerReason && (
                          <span className="text-[8px] text-text-muted/60 uppercase">({t.tieBreakerReason})</span>
                        )}
                      </div>
                      <div className="flex gap-3 items-center">
                        <span className="text-green-400 font-bold">{t.wins}V</span>
                        <span className="text-red-400 font-bold">{t.losses}D</span>
                        <span className="text-white font-bold">SD {t.pointDifference > 0 ? '+' : ''}{t.pointDifference}</span>
                        <span className="text-accent font-black text-xs">{t.classificationPoints} pts</span>
                      </div>
                    </div>
                  );
                })}
                {standings.length === 0 && (
                  <div className="text-center py-8 text-xs text-text-muted italic">NENHUM DADO DE TIME</div>
                )}
              </div>
            </div>
          ) : (
            <div className="card card-border bg-base-200 p-6 rounded-xl">
              <h3 className="text-xs font-black uppercase text-primary mb-4 border-b border-primary/10 pb-2">Desempenho dos Times</h3>
              <div className="space-y-3">
                {teamStats.map((t, i) => (
                  <div key={t.teamId} className="flex justify-between items-center p-2 bg-white/5 rounded">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-muted text-[10px] w-4">{i + 1}º</span>
                      <span className="text-xs font-bold text-white uppercase">{teams.find(st => st.id === t.teamId)?.name || 'Time'}</span>
                    </div>
                    <div className="flex gap-4 items-center text-[10px] font-mono">
                      <span className="text-green-400">{t.wins}V</span>
                      <span className="text-red-400">{t.losses}D</span>
                      <span className="text-white font-bold">SD {t.pointDifference > 0 ? '+' : ''}{t.pointDifference}</span>
                    </div>
                  </div>
                ))}
                {teamStats.length === 0 && (
                  <div className="text-center py-8 text-xs text-text-muted italic">NENHUM DADO DE TIME</div>
                )}
              </div>
            </div>
          )}

          {session.type === 'tournament' && mvp && (
            <div className="card card-border bg-base-200 p-6 rounded-xl md:col-span-2">
              <h3 className="text-xs font-black uppercase text-accent mb-4 border-b border-accent/10 pb-2 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" /> MVP do Torneio
              </h3>
              <div className="flex items-center gap-4 p-4 bg-accent/5 rounded-xl border border-accent/20">
                <div className="text-3xl">⚡</div>
                <div>
                  <p className="font-black text-lg uppercase text-white leading-none mb-1">{mvp.playerName}</p>
                  <p className="text-[9px] text-text-muted uppercase">
                    {mvp.teamName || 'Sem Time'}
                  </p>
                  <p className="text-[9px] text-text-muted uppercase mt-1">
                    Destaque: {mvp.topReason} • Vitórias do time: {mvp.teamWinRate}%
                  </p>
                  <p className="text-xs font-black text-accent mt-2">{mvp.totalPoints} Pontos Marcados</p>
                </div>
              </div>
            </div>
          )}

          {session.type === 'tournament' && (
            <div className="card card-border bg-base-200 p-6 rounded-xl md:col-span-2">
              <h3 className="text-xs font-black uppercase text-text-muted mb-4 border-b border-white/5 pb-2 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-text-muted" /> Resumo do Torneio
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-black/20 rounded-xl border border-white/5">
                <div>
                  <p className="text-[8px] font-black uppercase text-text-muted">Total de Jogos</p>
                  <p className="text-sm font-black text-white font-mono">{sessionGames.length}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-text-muted">Total de Pontos</p>
                  <p className="text-sm font-black text-white font-mono">{sessPoints.length}</p>
                </div>
                <div className="sm:col-span-2 border-t border-white/5 pt-2">
                  <p className="text-[8px] font-black uppercase text-text-muted">Maior Placar</p>
                  <p className="text-xs font-black text-white uppercase font-mono">{getHighestScoreMatch(games.filter(g => g.sessionId === session.id), sessionTeams)}</p>
                </div>
                <div className="sm:col-span-2 border-t border-white/5 pt-2">
                  <p className="text-[8px] font-black uppercase text-text-muted">Jogo Mais Equilibrado</p>
                  <p className="text-xs font-black text-white uppercase font-mono">{getMostBalancedMatch(games.filter(g => g.sessionId === session.id), sessionTeams)}</p>
                </div>
                <div className="sm:col-span-2 border-t border-white/5 pt-2">
                  <p className="text-[8px] font-black uppercase text-text-muted">Maior Sequência de Vitórias</p>
                  <p className="text-xs font-black text-white uppercase">{getLongestWinStreak(games.filter(g => g.sessionId === session.id), sessionTeams)}</p>
                </div>
              </div>
            </div>
          )}

          {session.type === 'tournament' && (format === 'groups_knockout' || format === 'group_stage') && (
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Grupo A Standings */}
              <div className="card card-border bg-base-200 rounded-xl overflow-hidden">
                <div className="p-4 bg-base-300/50 border-b border-base-300 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-accent" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-accent">Classificação - Grupo A</h4>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-zebra table-sm w-full text-[10px] font-mono">
                    <thead>
                      <tr>
                        {['#', 'Time', 'J', 'V', 'D', 'PF', 'PC', 'SD', '%', 'Pts'].map(h => (
                          <th key={h} className="text-left text-[8px] uppercase text-base-content/60 font-black">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {standingsA.map((s, i) => {
                        const team = sessionTeams.find(t => t.id === s.teamId);
                        const color = getTeamColor(s.teamId);
                        return (
                          <tr key={s.teamId}>
                            <td>
                              <span className={`font-black ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                <span className="font-black text-white uppercase truncate max-w-[100px] block">{team?.name}</span>
                              </div>
                            </td>
                            <td className="text-base-content/60">{s.gamesPlayed}</td>
                            <td className="text-green-400 font-black">{s.wins}</td>
                            <td className="text-red-400">{s.losses}</td>
                            <td className="text-white">{s.pointsFor}</td>
                            <td className="text-base-content/60">{s.pointsAgainst}</td>
                            <td className={`font-black ${s.pointDifference > 0 ? 'text-green-400' : s.pointDifference < 0 ? 'text-red-400' : 'text-base-content/60'}`}>
                              {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}
                            </td>
                            <td className="text-base-content/60">{s.winRate}%</td>
                            <td className="text-accent font-black text-sm">{s.classificationPoints}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Grupo B Standings */}
              <div className="card card-border bg-base-200 rounded-xl overflow-hidden">
                <div className="p-4 bg-base-300/50 border-b border-base-300 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-accent" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-accent">Classificação - Grupo B</h4>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-zebra table-sm w-full text-[10px] font-mono">
                    <thead>
                      <tr>
                        {['#', 'Time', 'J', 'V', 'D', 'PF', 'PC', 'SD', '%', 'Pts'].map(h => (
                          <th key={h} className="text-left text-[8px] uppercase text-base-content/60 font-black">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {standingsB.map((s, i) => {
                        const team = sessionTeams.find(t => t.id === s.teamId);
                        const color = getTeamColor(s.teamId);
                        return (
                          <tr key={s.teamId}>
                            <td>
                              <span className={`font-black ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                <span className="font-black text-white uppercase truncate max-w-[100px] block">{team?.name}</span>
                              </div>
                            </td>
                            <td className="text-base-content/60">{s.gamesPlayed}</td>
                            <td className="text-green-400 font-black">{s.wins}</td>
                            <td className="text-red-400">{s.losses}</td>
                            <td className="text-white">{s.pointsFor}</td>
                            <td className="text-base-content/60">{s.pointsAgainst}</td>
                            <td className={`font-black ${s.pointDifference > 0 ? 'text-green-400' : s.pointDifference < 0 ? 'text-red-400' : 'text-base-content/60'}`}>
                              {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}
                            </td>
                            <td className="text-base-content/60">{s.winRate}%</td>
                            <td className="text-accent font-black text-sm">{s.classificationPoints}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Match log */}
        <div className="card card-border bg-base-200 p-6 rounded-xl">
          <h3 className="text-xs font-black uppercase text-base-content/60 mb-6 border-b border-base-300 pb-2 flex items-center gap-2">
            <HistoryIcon className="w-3.5 h-3.5" /> Histórico de Jogos
          </h3>
          <div className="space-y-3">
            {sessionGames
              .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
              .map(game => {
                const tA = teams.find(t => t.id === game.teamAId);
                const tB = teams.find(t => t.id === game.teamBId);
                return (
                  <div key={game.id} className="flex items-center justify-between p-3 bg-black/20 rounded border border-white/5 gap-3">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex flex-col items-start shrink-0 min-w-[40px]">
                        <span className="text-[10px] font-mono text-text-muted">#{game.sequenceNumber}</span>
                        {game.stage && game.stage !== 'group' && (
                          <span className="text-[6px] font-black uppercase text-accent leading-none mt-0.5">
                            {game.stage === 'semifinal' ? 'Semi' : game.stage === 'third_place' ? '3º Lugar' : 'Final'}
                          </span>
                        )}
                        {game.groupId && (
                          <span className="text-[6px] font-black uppercase text-white/40 leading-none mt-0.5">
                            Grupo {game.groupId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-1 justify-center">
                        <span className={`text-xs font-black uppercase flex-1 text-right ${game.winnerTeamId === game.teamAId ? 'text-white' : 'text-text-muted'}`}>{tA?.name}</span>
                        <div className="flex gap-2 items-center px-4 py-1 bg-white/5 rounded font-mono font-black text-sm">
                          <span className={game.winnerTeamId === game.teamAId ? 'text-primary' : ''}>{game.scoreA}</span>
                          <span className="text-white/20">×</span>
                          <span className={game.winnerTeamId === game.teamBId ? 'text-primary' : ''}>{game.scoreB}</span>
                        </div>
                        <span className={`text-xs font-black uppercase flex-1 ${game.winnerTeamId === game.teamBId ? 'text-white' : 'text-text-muted'}`}>{tB?.name}</span>
                      </div>
                    </div>
                    <div className="text-[8px] font-mono text-text-muted uppercase">
                      {game.finishedAt ? new Date(game.finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---'}
                    </div>
                  </div>
                );
              })}
            {sessionGames.length === 0 && (
              <div className="text-center py-12 text-xs text-text-muted italic">NENHUMA PARTIDA FINALIZADA</div>
            )}
          </div>
        </div>

        <div className="card card-border bg-base-200 p-6 rounded-xl">
          <h3 className="text-xs font-black uppercase text-base-content/60 mb-6 border-b border-base-300 pb-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Eventos de ponto
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {sessPoints
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              .map(point => {
                const game = games.find(g => g.id === point.gameId);
                const team = teams.find(t => t.id === point.scoringTeamId);
                const player = players.find(p => p.id === point.playerId);
                return (
                  <div key={point.id} className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5 text-[10px]">
                    <div>
                      <p className="font-black uppercase text-white">J{game?.sequenceNumber || '-'} | #{point.sequenceNumber} | {team?.name || 'Time'}</p>
                      <p className="text-text-muted uppercase">{player?.nome || 'Ponto do time'} | {point.reason || 'unknown'}</p>
                    </div>
                    <p className="font-mono font-black text-accent">{point.scoreAfter.teamA}x{point.scoreAfter.teamB}</p>
                  </div>
                );
              })}
            {sessPoints.length === 0 && (
              <div className="text-center py-8 text-xs text-text-muted italic">NENHUM EVENTO REGISTRADO</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
