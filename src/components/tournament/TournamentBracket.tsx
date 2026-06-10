import React from 'react';
import { Game, Team } from '../../types';
import { getTeamDisplayName } from '../../logic/tournament';
import { Trophy } from 'lucide-react';

interface TournamentBracketProps {
  games: Game[];
  teams: Team[];
}

/* ── tiny match card ── */
function MatchCard({ game, teams, highlight }: { game: Game; teams: Team[]; highlight?: boolean }) {
  const teamAName = getTeamDisplayName(game.teamAId, teams);
  const teamBName = getTeamDisplayName(game.teamBId, teams);
  const isFinished = game.status === 'finished' || game.status === 'walkover';
  const winnerA = isFinished && game.winnerTeamId === game.teamAId;
  const winnerB = isFinished && game.winnerTeamId === game.teamBId;

  return (
    <div
      className={`rounded-lg border shadow-md overflow-hidden ${
        highlight
          ? 'bg-accent/5 border-accent/30 shadow-accent/10'
          : 'bg-base-300 border-base-300/60'
      }`}
      style={{ width: '100%', minWidth: 0 }}
    >
      <div
        className={`flex items-center justify-between gap-1 px-2.5 py-1.5 text-[11px] border-b border-base-100/30 ${
          winnerA ? 'bg-accent/10' : ''
        }`}
      >
        <span
          className={`font-bold uppercase truncate ${
            winnerA ? 'text-accent' : 'text-base-content/70'
          }`}
        >
          {teamAName}
        </span>
        {isFinished && (
          <span
            className={`font-mono font-bold shrink-0 ${
              winnerA ? 'text-accent' : 'text-base-content/40'
            }`}
          >
            {game.scoreA}
          </span>
        )}
      </div>
      <div
        className={`flex items-center justify-between gap-1 px-2.5 py-1.5 text-[11px] ${
          winnerB ? 'bg-accent/10' : ''
        }`}
      >
        <span
          className={`font-bold uppercase truncate ${
            winnerB ? 'text-accent' : 'text-base-content/70'
          }`}
        >
          {teamBName}
        </span>
        {isFinished && (
          <span
            className={`font-mono font-bold shrink-0 ${
              winnerB ? 'text-accent' : 'text-base-content/40'
            }`}
          >
            {game.scoreB}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── SVG: merge N source slots into N/2 output slots (left→right) ── */
function MergeConnector({
  sourceCount,
  gapWidth,
  totalHeight,
}: {
  sourceCount: number;
  gapWidth: number;
  totalHeight: number;
}) {
  if (sourceCount < 2) return null;

  const pairCount = Math.floor(sourceCount / 2);
  const lines: React.ReactNode[] = [];
  const sectionHeight = totalHeight / sourceCount;

  for (let i = 0; i < pairCount; i++) {
    const topIdx = i * 2;
    const botIdx = i * 2 + 1;
    const topY = sectionHeight * topIdx + sectionHeight / 2;
    const botY = sectionHeight * botIdx + sectionHeight / 2;
    const midY = (topY + botY) / 2;

    const x0 = 0;
    const x1 = gapWidth / 2;
    const x2 = gapWidth;
    lines.push(
      <line key={`top-h-${i}`} x1={x0} y1={topY} x2={x1} y2={topY} />,
      <line key={`bot-h-${i}`} x1={x0} y1={botY} x2={x1} y2={botY} />,
      <line key={`vert-${i}`} x1={x1} y1={topY} x2={x1} y2={botY} />,
      <line key={`out-${i}`} x1={x1} y1={midY} x2={x2} y2={midY} />,
    );
  }

  return (
    <svg width={gapWidth} height={totalHeight} className="shrink-0 block">
      <g stroke="currentColor" className="text-base-content/25" strokeWidth="2" fill="none">
        {lines}
      </g>
    </svg>
  );
}

/* ── SVG: simple horizontal line ── */
function SimpleConnector({ gapWidth, height }: { gapWidth: number; height: number }) {
  const midY = height / 2;
  return (
    <svg width={gapWidth} height={height} className="shrink-0 block">
      <line
        x1={0}
        y1={midY}
        x2={gapWidth}
        y2={midY}
        stroke="currentColor"
        className="text-base-content/25"
        strokeWidth="2"
      />
    </svg>
  );
}

function BracketHeader() {
  return (
    <div className="flex items-center gap-2 mb-4 border-b border-base-300 pb-2">
      <Trophy className="w-4 h-4 text-accent" />
      <h4 className="text-xs font-bold uppercase tracking-widest text-base-content">
        Chaveamento do Mata-Mata
      </h4>
    </div>
  );
}

/* ── round column: N games vertically distributed ── */
function RoundColumn({
  title,
  games,
  teams,
  totalHeight,
  colWidth,
  highlight,
}: {
  title: string;
  games: Game[];
  teams: Team[];
  totalHeight: number;
  colWidth: number;
  highlight?: boolean;
}) {
  const count = games.length;
  if (count === 0) return null;
  const sectionHeight = totalHeight / count;

  return (
    <div className="flex flex-col shrink-0" style={{ width: colWidth }}>
      <div
        className={`text-[8px] font-black uppercase tracking-wider text-center mb-2 ${
          highlight ? 'text-accent' : 'text-base-content/50'
        }`}
      >
        {title}
      </div>
      <div className="relative" style={{ height: totalHeight }}>
        {games.map((g, idx) => (
          <div
            key={g.id}
            className="absolute left-0 right-0 flex items-center"
            style={{ top: sectionHeight * idx, height: sectionHeight }}
          >
            <div className="w-full px-0.5" style={{ margin: 'auto 0' }}>
              <MatchCard game={g} teams={teams} highlight={highlight} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MATCH_HEIGHT = 72;
const COL_WIDTH = 150;
const GAP_WIDTH = 32;
const TITLE_OFFSET = 20;

export function TournamentBracket({ games, teams }: TournamentBracketProps) {
  const knockoutGroupGames = games
    .filter((g) => g.stage === 'group' && !g.groupId)
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  const semis = games
    .filter((g) => g.stage === 'semifinal')
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  const finalGame = games.find((g) => g.stage === 'final');
  const thirdPlaceGame = games.find((g) => g.stage === 'third_place');

  if (semis.length === 0 && !finalGame && knockoutGroupGames.length === 0) {
    return null;
  }

  // Build rounds left→right
  const rounds: { title: string; games: Game[]; highlight?: boolean }[] = [];

  if (knockoutGroupGames.length > 0) {
    rounds.push({ title: 'Quartas', games: knockoutGroupGames });
  }
  if (semis.length > 0) {
    rounds.push({ title: 'Semifinais', games: semis });
  }
  if (finalGame) {
    rounds.push({ title: 'Final', games: [finalGame], highlight: true });
  }

  if (rounds.length === 0) return null;

  // Height based on first (widest) round
  const baseCount = rounds[0].games.length;
  const bracketH = Math.max(baseCount * MATCH_HEIGHT, MATCH_HEIGHT * 2);

  return (
    <div className="card card-border bg-base-200 p-5 rounded-2xl">
      <BracketHeader />

      {/* Main bracket: left → right */}
      <div className="overflow-x-auto py-2">
        <div className="flex items-start" style={{ minWidth: 'fit-content' }}>
          {rounds.map((round, rIdx) => (
            <React.Fragment key={round.title + rIdx}>
              {rIdx > 0 && (
                <div style={{ paddingTop: TITLE_OFFSET }}>
                  {rounds[rIdx - 1].games.length >= 2 &&
                  round.games.length < rounds[rIdx - 1].games.length ? (
                    <MergeConnector
                      sourceCount={rounds[rIdx - 1].games.length}
                      gapWidth={GAP_WIDTH}
                      totalHeight={bracketH}
                    />
                  ) : (
                    <SimpleConnector gapWidth={GAP_WIDTH} height={bracketH} />
                  )}
                </div>
              )}
              <RoundColumn
                title={round.title}
                games={round.games}
                teams={teams}
                totalHeight={bracketH}
                colWidth={COL_WIDTH}
                highlight={round.highlight}
              />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 3rd place: offset below the bracket */}
      {thirdPlaceGame && (
        <div className="mt-4 pt-3 border-t border-base-300/50">
          <div
            className="flex items-start gap-2"
            style={{
              paddingLeft: rounds.length > 1 ? (COL_WIDTH + GAP_WIDTH) * (rounds.length - 1) : 0,
            }}
          >
            <div style={{ width: COL_WIDTH }}>
              <div className="text-[8px] font-black uppercase tracking-wider text-center mb-2 text-base-content/50">
                Disputa de 3º Lugar
              </div>
              <MatchCard game={thirdPlaceGame} teams={teams} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
