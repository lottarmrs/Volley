import { FreePlayConfig, Game, PointEvent, GameWinner } from '../types';

export const getGameWinner = (scoreA: number, scoreB: number, rules: { maxPoints: number, tieBreakMethod: string, hardPointCap?: number | null }): GameWinner => {
  const { maxPoints, tieBreakMethod, hardPointCap } = rules;

  const high = Math.max(scoreA, scoreB);
  const low = Math.min(scoreA, scoreB);
  const diff = high - low;

  if (tieBreakMethod === "direct_3") {
    const directCap = maxPoints + 2;

    if (high >= maxPoints && low <= maxPoints - 2 && diff >= 2) {
      return scoreA > scoreB ? "A" : "B";
    }

    if (scoreA === directCap || scoreB === directCap) {
      return scoreA > scoreB ? "A" : "B";
    }

    return null;
  }

  if (tieBreakMethod === "win_by_2") {
    if (hardPointCap && high >= hardPointCap) {
      return scoreA > scoreB ? "A" : "B";
    }

    if (high >= maxPoints && diff >= 2) {
      return scoreA > scoreB ? "A" : "B";
    }

    return null;
  }

  return null;
};

export interface RotateInput {
  courtTeams: [string, string];
  queue: string[];
  winnerId: string;
  loserId: string;
  rotationSystem: "winner_stays" | "max_consecutive_games";
  consecutiveGamesByTeam: Record<string, number>;
  maxConsecutiveGames?: number | null;
}

export interface RotateOutput {
  nextCourtTeams: [string, string];
  nextQueue: string[];
  nextConsecutiveGamesByTeam: Record<string, number>;
}

export const rotateTeams = (input: RotateInput): RotateOutput => {
  const { courtTeams, queue = [], winnerId, loserId, rotationSystem, consecutiveGamesByTeam, maxConsecutiveGames } = input;
  
  // Track how many games each team has played consecutively on court
  const winnerConsecutive = (consecutiveGamesByTeam[winnerId] || 0) + 1;
  const loserConsecutive = (consecutiveGamesByTeam[loserId] || 0) + 1;
  const nextQueue = [...(queue || [])];

  // Logic: A team MUST leave if it has reached the maxConsecutiveGames limit
  const winnerMustLeave = 
    rotationSystem === "max_consecutive_games" && 
    !!maxConsecutiveGames && 
    winnerConsecutive >= maxConsecutiveGames;
  const loserMustLeave = true; // Traditionally losers always leave in winner_stays

  if (winnerMustLeave) {
    // Winner leaves because of limit, loser stays
    nextQueue.push(winnerId);
    
    const nextIn = nextQueue.shift();
    
    // If no one is in the queue, the winner has to stay anyway (safety)
    const finalIn = nextIn || winnerId;

    return {
      nextCourtTeams: [loserId, finalIn],
      nextQueue,
      nextConsecutiveGamesByTeam: {
        ...consecutiveGamesByTeam,
        [winnerId]: 0,
        [loserId]: loserConsecutive,
        [finalIn]: 0
      }
    };
  }

  // Standard Winner Stays logic
  if (rotationSystem === "winner_stays" || !rotationSystem) {
    nextQueue.push(loserId);
    const nextIn = nextQueue.shift();
    let finalIn = nextIn || loserId; 

    // Safety: ensure nextIn isn't the winner (who is staying)
    if (finalIn === winnerId) {
      finalIn = loserId;
    }

    return {
      nextCourtTeams: [winnerId, finalIn],
      nextQueue,
      nextConsecutiveGamesByTeam: {
        ...consecutiveGamesByTeam,
        [winnerId]: winnerConsecutive,
        [loserId]: 0,
        [finalIn]: 0
      }
    };
  }

  // Fallback (should not be reached with current UI)
  nextQueue.push(loserId);
  const nextIn = nextQueue.shift() || loserId;
  return {
    nextCourtTeams: [winnerId, nextIn],
    nextQueue,
    nextConsecutiveGamesByTeam: { [winnerId]: winnerConsecutive, [loserId]: 0, [nextIn]: 0 }
  };
};
