import { Team, Session } from '../types';

export type PartnershipMatrix = Record<string, number>;

export function buildPartnershipMatrix(
  sessions: Session[],
  teams: Team[],
  opts = { lookback: 6, decay: 0.8 },
): PartnershipMatrix {
  const finished = sessions
    .filter((s) => s.status === 'finished')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, opts.lookback);

  const matrix: PartnershipMatrix = {};
  finished.forEach((s, idx) => {
    const weight = Math.pow(opts.decay, idx);
    teams
      .filter((t) => t.sessionId === s.id)
      .forEach((team) => {
        const ids = [...(team.playerIds || [])].sort();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]}|${ids[j]}`;
            matrix[key] = (matrix[key] ?? 0) + weight;
          }
        }
      });
  });
  return matrix;
}
