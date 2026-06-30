/**
 * VUT — Volley Ultimate Team: motor de cartas.
 *
 * Tudo é DERIVADO em tempo de leitura. Nenhuma persistência nova no v1.
 * A carta é uma representação visual de dados que já existem.
 */

import { Player, Position, Session, Team, PointEvent, Game, SessionReport } from '../types';
import { calculatePositionOverall, getPlayerRecommendation } from './calculations';
import { autoFormFromHistory, calculateSessionRating, calculateMatchRating } from './rating';
import { calculateSessionRecognition } from './match';
import { buildPartnershipMatrix, PartnershipMatrix } from './partnershipHistory';
import { calculatePlayerStats, PlayerStats } from './statistics';

// ─── Types ──────────────────────────────────────────────────────────────────

export type VutTier = 'bronze' | 'silver' | 'gold' | 'elite';

export type VutEditionKind = 'base' | 'mvp' | 'maestro' | 'muralha' | 'in_form';

export interface VutEdition {
  kind: VutEditionKind;
  label: string;
  emoji: string;
}

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface CardFrame {
  id: string;
  name: string;
  rarity: AchievementRarity;
  /** CSS class suffix applied to the card for visual styling. */
  styleKey: string;
}

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  rarity: AchievementRarity;
  frame: CardFrame;
  /** True when the player meets the condition. */
  unlocked: boolean;
  /** Current progress toward the goal. */
  current: number;
  /** Target value to unlock. */
  target: number;
  /** Position this achievement applies to, or 'all'. */
  position: Position | 'all';
  description: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  rarity: AchievementRarity;
  position: Position | 'all';
  frame: CardFrame;
  condition: (stats: PlayerStats, ctx: AchievementContext) => boolean;
  progress: (stats: PlayerStats, ctx: AchievementContext) => { current: number; target: number };
}

export interface AchievementContext {
  player: Player;
  sessionsAttended: number;
  mvpCount: number;
  maestroCount: number;
  muralhaCount: number;
  formAvg: number | null;
  recentRatings: number[];
  /** Contribution ≥ threshold in N sessions (precomputed). */
  highContribSessions: number;
  /** Games with low error rate (precomputed). */
  lowErrorGames: number;
  /** Games with high rating (precomputed). */
  highRatingGames: number;
  /** Highlights broken down by skill. */
  defenseHighlights: number;
  receptionHighlights: number;
}

export type FormBadgeColor = 'green' | 'yellow' | 'red' | 'gray';

export interface FutStats {
  ovr: number;
  atq: number;
  blo: number;
  saq: number;
  lev: number;
  def: number;
  fis: number;
  tier: VutTier;
  versatility: number; // 1–5
  hand: 'R' | 'L';
}

export interface VutCard {
  player: Player;
  stats: FutStats;
  posLabel: string;
  edition: VutEdition;
  formBadge: { value: number | null; color: FormBadgeColor };
  chemistry: { playerId: string; name: string; weight: number }[];
  achievements: Achievement[];
  activeFrame: CardFrame;
}

// ─── Position labels ────────────────────────────────────────────────────────

const POS_LABELS: Record<Position, string> = {
  levantador: 'LEV',
  oposto: 'OPO',
  ponteiro: 'PON',
  central: 'CEN',
  libero: 'LIB',
  'all-rounder': 'ALL',
};

// ─── Constants ──────────────────────────────────────────────────────────────

export const VUT_CONSTANTS = {
  /** Calibration curve: attribute 0–10 → FUT scale 0–99.
   *  1→28, 5→60, 8→84, 10→99. Tunable. */
  curveOffset: 20,
  curveScale: 8,

  /** Tier thresholds by OVR. */
  tierElite: 85,
  tierGold: 75,
  tierSilver: 60,

  /** In-Form: minimum streak length and rating threshold. */
  inFormStreak: 3,
  inFormThreshold: 7.0,

  /** Form badge color thresholds. */
  formGreen: 8,
  formYellow: 6,

  /** Versatility: how close to best rating a secondary position must be. */
  versatilityGap: 5,
} as const;

// ─── Core functions ─────────────────────────────────────────────────────────

/** Convert an attribute (0–10) to FUT scale (1–99) with calibration curve. */
export function toFut(v: number): number {
  return Math.max(
    1,
    Math.min(99, Math.round(VUT_CONSTANTS.curveOffset + v * VUT_CONSTANTS.curveScale)),
  );
}

/** Derive tier from OVR (0–99). */
export function tierFromOvr(ovr: number): VutTier {
  if (ovr >= VUT_CONSTANTS.tierElite) return 'elite';
  if (ovr >= VUT_CONSTANTS.tierGold) return 'gold';
  if (ovr >= VUT_CONSTANTS.tierSilver) return 'silver';
  return 'bronze';
}

/** Calculate the 6 macro stats + OVR + tier + versatility + hand. */
export function generateFutStats(player: Player): FutStats {
  const { atributos } = player;

  const ovr = Math.min(99, calculatePositionOverall(player, player.posicaoPrincipal));

  const atq = toFut(atributos.ataque);
  const blo = toFut(atributos.bloqueio);
  const saq = toFut(atributos.saque);
  const lev = toFut(atributos.levantamento);
  const def = toFut((atributos.defesa + atributos.recepcao) / 2);
  const fis = toFut((atributos.velocidade + atributos.resistencia) / 2);

  const tier = tierFromOvr(ovr);

  // Versatility: count positions with rating within `versatilityGap` of the best.
  const rec = getPlayerRecommendation(player);
  const bestRating = rec.allPositions[0].rating;
  const versatility = Math.max(
    1,
    Math.min(
      5,
      rec.allPositions.filter((p) => p.rating >= bestRating - VUT_CONSTANTS.versatilityGap).length,
    ),
  );

  const hand = player.maoDominante === 'esquerda' ? 'L' : 'R';

  return { ovr, atq, blo, saq, lev, def, fis, tier, versatility, hand };
}

// ─── Form badge ─────────────────────────────────────────────────────────────

export function formBadgeColor(value: number | null): FormBadgeColor {
  if (value == null) return 'gray';
  if (value >= VUT_CONSTANTS.formGreen) return 'green';
  if (value >= VUT_CONSTANTS.formYellow) return 'yellow';
  return 'red';
}

// ─── Edition resolution ─────────────────────────────────────────────────────

export interface EditionContext {
  /** All points from the player's last finished session. */
  lastSessionPoints: PointEvent[];
  /** All games from the player's last finished session. */
  lastSessionGames: Game[];
  /** Teams from the player's last finished session. */
  lastSessionTeams: Team[];
  /** All players that participated. */
  participants: Player[];
}

const EDITION_BASE: VutEdition = { kind: 'base', label: 'Base', emoji: '⚪' };
const EDITION_MVP: VutEdition = { kind: 'mvp', label: 'MVP da Noite', emoji: '🏆' };
const EDITION_MAESTRO: VutEdition = { kind: 'maestro', label: 'Maestro', emoji: '🎯' };
const EDITION_MURALHA: VutEdition = { kind: 'muralha', label: 'Muralha', emoji: '🧱' };
const EDITION_IN_FORM: VutEdition = { kind: 'in_form', label: 'Em Alta', emoji: '🟣' };

/** Resolve the player's special edition from last session context. Priority: MVP > Maestro > Muralha > In-Form > Base. */
export function resolvePlayerEdition(player: Player, ctx: EditionContext | null): VutEdition {
  if (!ctx || ctx.lastSessionGames.length === 0) {
    // No session context — check In-Form from history only.
    return checkInForm(player) ? EDITION_IN_FORM : EDITION_BASE;
  }

  // 1. MVP — highest session rating among all participants.
  const ratings = ctx.participants
    .map((p) => ({
      playerId: p.id,
      rating: calculateSessionRating({
        player: p,
        sessionGames: ctx.lastSessionGames,
        sessionPoints: ctx.lastSessionPoints,
        teams: ctx.lastSessionTeams,
      }),
    }))
    .filter((r) => r.rating != null)
    .sort((a, b) => b.rating! - a.rating!);

  if (ratings.length > 0 && ratings[0].playerId === player.id) {
    return EDITION_MVP;
  }

  // 2–3. Maestro / Muralha — from session recognition.
  const rec = calculateSessionRecognition(ctx.lastSessionPoints);
  if (rec.maestro?.playerId === player.id) return EDITION_MAESTRO;
  if (rec.muralha?.playerId === player.id) return EDITION_MURALHA;

  // 4. In-Form — streak of high ratings.
  if (checkInForm(player)) return EDITION_IN_FORM;

  return EDITION_BASE;
}

function checkInForm(player: Player): boolean {
  const hist = player.formaAtual?.ultimasPartidas ?? [];
  if (hist.length < VUT_CONSTANTS.inFormStreak) return false;
  const recent = hist.slice(-VUT_CONSTANTS.inFormStreak);
  return recent.every((r) => r >= VUT_CONSTANTS.inFormThreshold);
}

// ─── Chemistry ──────────────────────────────────────────────────────────────

export interface ChemistryPartner {
  playerId: string;
  name: string;
  weight: number;
}

/** Extract top-N partners from a pre-built partnership matrix. */
export function playerChemistry(
  playerId: string,
  matrix: PartnershipMatrix,
  players: Player[],
  topN = 3,
): ChemistryPartner[] {
  const entries: { partnerId: string; weight: number }[] = [];

  for (const [key, weight] of Object.entries(matrix)) {
    const [a, b] = key.split('|');
    if (a === playerId) entries.push({ partnerId: b, weight });
    else if (b === playerId) entries.push({ partnerId: a, weight });
  }

  return entries
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
    .map((e) => {
      const p = players.find((pl) => pl.id === e.partnerId);
      return {
        playerId: e.partnerId,
        name: p?.apelido || p?.nome || '?',
        weight: Math.round(e.weight * 10) / 10,
      };
    });
}

// ─── Build full card ────────────────────────────────────────────────────────

export interface BuildVutCardContext {
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  players: Player[];
  sessionReports: SessionReport[];
  /** Pre-built to avoid re-computing per card. */
  partnershipMatrix?: PartnershipMatrix;
}

const DEFAULT_FRAME: CardFrame = {
  id: 'default',
  name: 'Padrão',
  rarity: 'common',
  styleKey: 'default',
};

/** Build the complete VUT card for a player. Expensive — call on-demand, memoize. */
export function buildVutCard(player: Player, ctx: BuildVutCardContext): VutCard {
  const stats = generateFutStats(player);
  const posLabel = POS_LABELS[player.posicaoPrincipal] || 'ALL';

  // Form badge
  const formAvg = autoFormFromHistory(player);
  const formBadge = { value: formAvg, color: formBadgeColor(formAvg) };

  // Edition: find last finished session the player participated in.
  const editionCtx = resolveLastSessionContext(player, ctx);
  const edition = resolvePlayerEdition(player, editionCtx);

  // Chemistry
  const matrix = ctx.partnershipMatrix ?? buildPartnershipMatrix(ctx.sessions, ctx.teams);
  const chemistry = playerChemistry(player.id, matrix, ctx.players);

  // Achievements
  const playerStats = calculatePlayerStats(
    player,
    ctx.games,
    ctx.pointEvents,
    ctx.teams,
    ctx.sessions,
  );
  const achievementCtx = buildAchievementContext(player, playerStats, ctx);
  const achievements = resolveAchievements(player, playerStats, achievementCtx);
  const activeFrame = resolveCardFrame(achievements);

  return { player, stats, posLabel, edition, formBadge, chemistry, achievements, activeFrame };
}

// ─── Achievement system ─────────────────────────────────────────────────────

function buildAchievementContext(
  player: Player,
  stats: PlayerStats,
  ctx: BuildVutCardContext,
): AchievementContext {
  // Count sessions attended
  const finishedSessions = ctx.sessions.filter((s) => s.status === 'finished');
  const sessionsAttended = finishedSessions.filter((s) => {
    const sessionTeams = ctx.teams.filter((t) => t.sessionId === s.id);
    return sessionTeams.some((t) => t.playerIds.includes(player.id));
  }).length;

  // Count MVP / Maestro / Muralha awards
  let mvpCount = 0;
  let maestroCount = 0;
  let muralhaCount = 0;

  for (const session of finishedSessions) {
    const sessionTeams = ctx.teams.filter((t) => t.sessionId === session.id);
    if (!sessionTeams.some((t) => t.playerIds.includes(player.id))) continue;

    const sessionPoints = ctx.pointEvents.filter((p) => p.sessionId === session.id);
    const sessionGames = ctx.games.filter(
      (g) => g.sessionId === session.id && g.status === 'finished',
    );

    // MVP: top-1 session rating
    const participants = ctx.players.filter((p) =>
      sessionTeams.some((t) => t.playerIds.includes(p.id)),
    );
    const ratings = participants
      .map((p) => ({
        id: p.id,
        rating: calculateSessionRating({
          player: p,
          sessionGames,
          sessionPoints,
          teams: sessionTeams,
        }),
      }))
      .filter((r) => r.rating != null)
      .sort((a, b) => b.rating! - a.rating!);
    if (ratings.length > 0 && ratings[0].id === player.id) mvpCount++;

    // Maestro / Muralha
    const rec = calculateSessionRecognition(sessionPoints);
    if (rec.maestro?.playerId === player.id) maestroCount++;
    if (rec.muralha?.playerId === player.id) muralhaCount++;
  }

  const formAvg = autoFormFromHistory(player);
  const recentRatings = player.formaAtual?.ultimasPartidas ?? [];

  // Highlights by skill type
  const allHighlights = ctx.pointEvents.filter(
    (p) => p.eventKind === 'highlight' && p.playerId === player.id,
  );
  const defenseHighlights = allHighlights.filter((p) => p.skill === 'defesa').length;
  const receptionHighlights = allHighlights.filter((p) => p.skill === 'recepcao').length;

  return {
    player,
    sessionsAttended,
    mvpCount,
    maestroCount,
    muralhaCount,
    formAvg,
    recentRatings,
    highContribSessions: 0, // computed in specific achievements if needed
    lowErrorGames: 0,
    highRatingGames: countGamesWithMinRating(player, ctx, 8.5),
    defenseHighlights,
    receptionHighlights,
  };
}

function countGamesWithMinRating(
  player: Player,
  ctx: BuildVutCardContext,
  minRating: number,
): number {
  let count = 0;
  const finishedGames = ctx.games.filter((g) => g.status === 'finished');
  for (const game of finishedGames) {
    const team = ctx.teams.find(
      (t) =>
        t.sessionId === game.sessionId &&
        t.playerIds.includes(player.id) &&
        (t.id === game.teamAId || t.id === game.teamBId),
    );
    if (!team) continue;
    const gamePoints = ctx.pointEvents.filter((p) => p.gameId === game.id);
    const rating = calculateMatchRating({ player, game, gamePoints, playerTeamId: team.id });
    if (rating >= minRating) count++;
  }
  return count;
}

// ─── Achievement catalog ────────────────────────────────────────────────────

function frame(id: string, name: string, rarity: AchievementRarity, styleKey: string): CardFrame {
  return { id, name, rarity, styleKey };
}

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // ── Shared (all positions) ──────────────────────────────────────────────
  {
    id: 'shared_cria',
    name: 'Cria da Quadra',
    emoji: '🏠',
    rarity: 'common',
    position: 'all',
    frame: frame('f_cria', 'Piso de Quadra', 'common', 'court-floor'),
    condition: (s) => s.gamesPlayed >= 50,
    progress: (s) => ({ current: s.gamesPlayed, target: 50 }),
  },
  {
    id: 'shared_rodou',
    name: 'Rodou a Bola',
    emoji: '🔄',
    rarity: 'uncommon',
    position: 'all',
    frame: frame('f_rodou', 'Linhas de Rotação', 'uncommon', 'rotation-lines'),
    condition: (s) => s.gamesPlayed >= 100,
    progress: (s) => ({ current: s.gamesPlayed, target: 100 }),
  },
  {
    id: 'shared_presenca',
    name: 'Presença Garantida',
    emoji: '✅',
    rarity: 'common',
    position: 'all',
    frame: frame('f_presenca', 'Borda Sólida', 'common', 'solid-reliable'),
    condition: (_s, c) => c.sessionsAttended >= 20,
    progress: (_s, c) => ({ current: c.sessionsAttended, target: 20 }),
  },
  {
    id: 'shared_ponto',
    name: 'Ponto Feito',
    emoji: '⚡',
    rarity: 'uncommon',
    position: 'all',
    frame: frame('f_ponto', 'Faísca Elétrica', 'uncommon', 'electric-spark'),
    condition: (s) => s.totalPoints >= 100,
    progress: (s) => ({ current: s.totalPoints, target: 100 }),
  },
  {
    id: 'shared_cestinha',
    name: 'Cestinha',
    emoji: '🏅',
    rarity: 'rare',
    position: 'all',
    frame: frame('f_cestinha', 'Contagem Dourada', 'rare', 'golden-count'),
    condition: (s) => s.totalPoints >= 250,
    progress: (s) => ({ current: s.totalPoints, target: 250 }),
  },
  {
    id: 'shared_placar',
    name: 'Bom de Placar',
    emoji: '📊',
    rarity: 'rare',
    position: 'all',
    frame: frame('f_placar', 'Gradiente Ascendente', 'rare', 'ascending-gradient'),
    condition: (s) => s.winRate >= 60 && s.gamesPlayed >= 30,
    progress: (s) => ({ current: Math.round(s.winRate), target: 60 }),
  },
  {
    id: 'shared_quente',
    name: 'Sequência Quente',
    emoji: '🔥',
    rarity: 'epic',
    position: 'all',
    frame: frame('f_quente', 'Glow Pulsante', 'epic', 'hot-glow'),
    condition: (_s, c) => {
      const r = c.recentRatings;
      if (r.length < 5) return false;
      return r.slice(-5).every((v) => v >= 7.5);
    },
    progress: (_s, c) => {
      const r = c.recentRatings.slice(-5);
      return { current: r.filter((v) => v >= 7.5).length, target: 5 };
    },
  },
  {
    id: 'shared_craque',
    name: 'Craque da Noite',
    emoji: '👑',
    rarity: 'legendary',
    position: 'all',
    frame: frame('f_craque', 'Holográfica Coroa', 'legendary', 'holographic-crown'),
    condition: (_s, c) => c.mvpCount >= 5,
    progress: (_s, c) => ({ current: c.mvpCount, target: 5 }),
  },
  {
    id: 'shared_qualquer',
    name: 'Joga em Qualquer Lugar',
    emoji: '🔀',
    rarity: 'rare',
    position: 'all',
    frame: frame('f_qualquer', 'Multi-cor', 'rare', 'multi-color'),
    condition: (_s, c) => {
      const rec = getPlayerRecommendation(c.player);
      const best = rec.allPositions[0].rating;
      return (
        rec.allPositions.filter((p) => p.rating >= best - VUT_CONSTANTS.versatilityGap).length >= 4
      );
    },
    progress: (_s, c) => {
      const rec = getPlayerRecommendation(c.player);
      const best = rec.allPositions[0].rating;
      return {
        current: rec.allPositions.filter((p) => p.rating >= best - VUT_CONSTANTS.versatilityGap)
          .length,
        target: 4,
      };
    },
  },
  {
    id: 'shared_saldo',
    name: 'Mais Acerta que Erra',
    emoji: '➕',
    rarity: 'uncommon',
    position: 'all',
    frame: frame('f_saldo', 'Verde Limpo', 'uncommon', 'clean-green'),
    condition: (s) => s.balance >= 50,
    progress: (s) => ({ current: s.balance, target: 50 }),
  },
  {
    id: 'shared_selecao',
    name: 'Nível Seleção',
    emoji: '💎',
    rarity: 'legendary',
    position: 'all',
    frame: frame('f_selecao', 'Cristalina Premium', 'legendary', 'crystal-premium'),
    condition: (_s, c) => {
      const ovr = Math.min(99, calculatePositionOverall(c.player, c.player.posicaoPrincipal));
      return ovr >= 85;
    },
    progress: (_s, c) => ({
      current: Math.min(99, calculatePositionOverall(c.player, c.player.posicaoPrincipal)),
      target: 85,
    }),
  },
  {
    id: 'shared_sempre',
    name: 'Sempre no Jogo',
    emoji: '🫡',
    rarity: 'common',
    position: 'all',
    frame: frame('f_sempre', 'Firme', 'common', 'firm-tone'),
    condition: (s, c) => c.sessionsAttended >= 30 && s.winRate >= 50,
    progress: (_s, c) => ({ current: c.sessionsAttended, target: 30 }),
  },

  // ── Levantador ──────────────────────────────────────────────────────────
  {
    id: 'lev_bom',
    name: 'Bom de Bola',
    emoji: '🤲',
    rarity: 'common',
    position: 'levantador',
    frame: frame('f_lev_bom', 'Traço Fino', 'common', 'thin-line'),
    condition: (s) => s.assists >= 10,
    progress: (s) => ({ current: s.assists, target: 10 }),
  },
  {
    id: 'lev_dono',
    name: 'Dono do Jogo',
    emoji: '🎯',
    rarity: 'rare',
    position: 'levantador',
    frame: frame('f_lev_dono', 'Geométrica Dourada', 'rare', 'geometric-gold'),
    condition: (s) => s.assists >= 50,
    progress: (s) => ({ current: s.assists, target: 50 }),
  },
  {
    id: 'lev_cerebro',
    name: 'Cérebro da Quadra',
    emoji: '🧠',
    rarity: 'epic',
    position: 'levantador',
    frame: frame('f_lev_cerebro', 'Circuitos Neurais', 'epic', 'neural-circuits'),
    condition: (s) => s.assists >= 100,
    progress: (s) => ({ current: s.assists, target: 100 }),
  },
  {
    id: 'lev_cara',
    name: 'O Cara do Passe',
    emoji: '🎭',
    rarity: 'rare',
    position: 'levantador',
    frame: frame('f_lev_cara', 'Traços de Movimento', 'rare', 'motion-strokes'),
    condition: (_s, c) => c.maestroCount >= 3,
    progress: (_s, c) => ({ current: c.maestroCount, target: 3 }),
  },
  {
    id: 'lev_classe',
    name: 'Toque de Classe',
    emoji: '✨',
    rarity: 'uncommon',
    position: 'levantador',
    frame: frame('f_lev_classe', 'Brilho Suave', 'uncommon', 'soft-sparkle'),
    condition: (s) => s.highlights >= 20,
    progress: (s) => ({ current: s.highlights, target: 20 }),
  },
  {
    id: 'lev_pontua',
    name: 'Levantador que Pontua',
    emoji: '🎲',
    rarity: 'uncommon',
    position: 'levantador',
    frame: frame('f_lev_pontua', 'Dual-Tone', 'uncommon', 'dual-tone'),
    condition: (s) => s.aces + s.tips + s.blocks >= 15,
    progress: (s) => ({ current: s.aces + s.tips + s.blocks, target: 15 }),
  },
  {
    id: 'lev_firme',
    name: 'Mão Firme',
    emoji: '🛡️',
    rarity: 'rare',
    position: 'levantador',
    frame: frame('f_lev_firme', 'Escudo Prateado', 'rare', 'silver-shield'),
    condition: (s) => s.gamesPlayed >= 20 && s.errors < s.gamesPlayed * 0.1,
    progress: (s) => ({ current: s.gamesPlayed, target: 20 }),
  },
  {
    id: 'lev_engrenagem',
    name: 'Engrenagem do Time',
    emoji: '⚙️',
    rarity: 'common',
    position: 'levantador',
    frame: frame('f_lev_engrenagem', 'Mecânica', 'common', 'mechanic'),
    condition: (s) => s.assists >= 10 && s.gamesPlayed >= 20,
    progress: (s) => ({ current: s.assists, target: 10 }),
  },
  {
    id: 'lev_frio',
    name: 'Maestro Frio',
    emoji: '🧊',
    rarity: 'epic',
    position: 'levantador',
    frame: frame('f_lev_frio', 'Gelo Cristalino', 'epic', 'crystal-ice'),
    condition: (s, c) => (c.formAvg ?? 0) >= 7.0 && s.assists >= 30,
    progress: (s) => ({ current: s.assists, target: 30 }),
  },
  {
    id: 'lev_batuta',
    name: 'Batuta',
    emoji: '🎼',
    rarity: 'legendary',
    position: 'levantador',
    frame: frame('f_lev_batuta', 'Shimmer Dourado', 'legendary', 'gold-shimmer'),
    condition: (_s, c) => c.maestroCount >= 3 && c.mvpCount >= 1,
    progress: (_s, c) => ({ current: c.maestroCount, target: 3 }),
  },

  // ── Oposto ──────────────────────────────────────────────────────────────
  {
    id: 'opo_braco',
    name: 'Braço Pesado',
    emoji: '💢',
    rarity: 'common',
    position: 'oposto',
    frame: frame('f_opo_braco', 'Impacto Vermelho', 'common', 'red-impact'),
    condition: (s) => s.cortadas >= 20,
    progress: (s) => ({ current: s.cortadas, target: 20 }),
  },
  {
    id: 'opo_canhao',
    name: 'Bola de Canhão',
    emoji: '🔥',
    rarity: 'rare',
    position: 'oposto',
    frame: frame('f_opo_canhao', 'Chama Intensa', 'rare', 'intense-flame'),
    condition: (s) => s.cortadas >= 50,
    progress: (s) => ({ current: s.cortadas, target: 50 }),
  },
  {
    id: 'opo_sem',
    name: 'Sem Defesa',
    emoji: '💣',
    rarity: 'epic',
    position: 'oposto',
    frame: frame('f_opo_sem', 'Radiação de Impacto', 'epic', 'impact-radiation'),
    condition: (s) => s.cortadas >= 100,
    progress: (s) => ({ current: s.cortadas, target: 100 }),
  },
  {
    id: 'opo_veneno',
    name: 'Saque Envenenado',
    emoji: '🐍',
    rarity: 'uncommon',
    position: 'oposto',
    frame: frame('f_opo_veneno', 'Sinuosas Verdes', 'uncommon', 'green-sinuous'),
    condition: (s) => s.aces >= 20,
    progress: (s) => ({ current: s.aces, target: 20 }),
  },
  {
    id: 'opo_maquina',
    name: 'Máquina de Ace',
    emoji: '☄️',
    rarity: 'epic',
    position: 'oposto',
    frame: frame('f_opo_maquina', 'Rastro de Cometa', 'epic', 'comet-trail'),
    condition: (s) => s.aces >= 50,
    progress: (s) => ({ current: s.aces, target: 50 }),
  },
  {
    id: 'opo_pontas',
    name: 'Ponto nas Duas Pontas',
    emoji: '⚔️',
    rarity: 'rare',
    position: 'oposto',
    frame: frame('f_opo_pontas', 'Espadas Cruzadas', 'rare', 'crossed-swords'),
    condition: (s) => s.cortadas >= 50 && s.aces >= 20,
    progress: (s) => ({ current: Math.min(s.cortadas, s.aces * 2.5), target: 50 }),
  },
  {
    id: 'opo_decisivo',
    name: 'Decisivo',
    emoji: '🎯',
    rarity: 'rare',
    position: 'oposto',
    frame: frame('f_opo_decisivo', 'Alvo Preciso', 'rare', 'precise-target'),
    condition: (_s, c) => c.highRatingGames >= 5,
    progress: (_s, c) => ({ current: c.highRatingGames, target: 5 }),
  },
  {
    id: 'opo_impacto',
    name: 'Oposto de Impacto',
    emoji: '🦾',
    rarity: 'uncommon',
    position: 'oposto',
    frame: frame('f_opo_impacto', 'Metal Cromado', 'uncommon', 'chrome-metal'),
    condition: (s) => s.totalPoints >= 150,
    progress: (s) => ({ current: s.totalPoints, target: 150 }),
  },
  {
    id: 'opo_completo',
    name: 'Ataque Completo',
    emoji: '🌊',
    rarity: 'epic',
    position: 'oposto',
    frame: frame('f_opo_completo', 'Onda de Energia', 'epic', 'energy-wave'),
    condition: (s) => s.blocks >= 10 && s.cortadas >= 30 && s.aces >= 10,
    progress: (s) => ({ current: Math.min(s.blocks, s.cortadas / 3, s.aces), target: 10 }),
  },
  {
    id: 'opo_dono',
    name: 'Dono da Rede',
    emoji: '🐆',
    rarity: 'legendary',
    position: 'oposto',
    frame: frame('f_opo_dono', 'Estampa Predadora', 'legendary', 'predator-print'),
    condition: (s) => s.pointsContribution >= 25 && s.gamesPlayed >= 30,
    progress: (s) => ({ current: Math.round(s.pointsContribution), target: 25 }),
  },

  // ── Ponteiro ────────────────────────────────────────────────────────────
  {
    id: 'pon_passador',
    name: 'Passador Seguro',
    emoji: '🤝',
    rarity: 'common',
    position: 'ponteiro',
    frame: frame('f_pon_passador', 'Curvas Suaves', 'common', 'smooth-curves'),
    condition: (_s, c) => c.receptionHighlights >= 20,
    progress: (_s, c) => ({ current: c.receptionHighlights, target: 20 }),
  },
  {
    id: 'pon_recebe_mata',
    name: 'Recebe e Mata',
    emoji: '⚡',
    rarity: 'rare',
    position: 'ponteiro',
    frame: frame('f_pon_recebe', 'Raio Diagonal', 'rare', 'diagonal-ray'),
    condition: (s, c) => s.cortadas >= 30 && c.receptionHighlights >= 15,
    progress: (s) => ({ current: s.cortadas, target: 30 }),
  },
  {
    id: 'pon_ponta',
    name: 'Ponta de Lança',
    emoji: '🌟',
    rarity: 'epic',
    position: 'ponteiro',
    frame: frame('f_pon_ponta', 'Estrela Cadente', 'epic', 'shooting-star'),
    condition: (s) => s.cortadas >= 60 && s.highlights >= 30,
    progress: (s) => ({ current: s.cortadas, target: 60 }),
  },
  {
    id: 'pon_viagem',
    name: 'Viagem de Saque',
    emoji: '🎯',
    rarity: 'uncommon',
    position: 'ponteiro',
    frame: frame('f_pon_viagem', 'Trajetória Curva', 'uncommon', 'curved-trajectory'),
    condition: (s) => s.aces >= 15,
    progress: (s) => ({ current: s.aces, target: 15 }),
  },
  {
    id: 'pon_faz_tudo',
    name: 'Faz Tudo na Ponta',
    emoji: '🔄',
    rarity: 'epic',
    position: 'ponteiro',
    frame: frame('f_pon_faz', 'Arco-Íris Circular', 'epic', 'rainbow-circle'),
    condition: (s) => s.cortadas >= 20 && s.aces >= 10 && s.blocks >= 10 && s.highlights >= 10,
    progress: (s) => ({
      current: Math.min(s.cortadas / 2, s.aces, s.blocks, s.highlights),
      target: 10,
    }),
  },
  {
    id: 'pon_ferro',
    name: 'Recepção de Ferro',
    emoji: '🛡️',
    rarity: 'rare',
    position: 'ponteiro',
    frame: frame('f_pon_ferro', 'Escudo com Aura', 'rare', 'aura-shield'),
    condition: (_s, c) => c.receptionHighlights + c.defenseHighlights >= 40,
    progress: (_s, c) => ({ current: c.receptionHighlights + c.defenseHighlights, target: 40 }),
  },
  {
    id: 'pon_nota',
    name: 'Nota Alta',
    emoji: '📈',
    rarity: 'uncommon',
    position: 'ponteiro',
    frame: frame('f_pon_nota', 'Gráfico Ascendente', 'uncommon', 'ascending-chart'),
    condition: (s, c) => (c.formAvg ?? 0) >= 7.0 && s.totalPoints >= 30,
    progress: (s) => ({ current: s.totalPoints, target: 30 }),
  },
  {
    id: 'pon_ganhou',
    name: 'Ganhou mais que Perdeu',
    emoji: '📊',
    rarity: 'common',
    position: 'ponteiro',
    frame: frame('f_pon_ganhou', 'Barras de Progresso', 'common', 'progress-bars'),
    condition: (s) => s.winRate >= 55 && s.gamesPlayed >= 20,
    progress: (s) => ({ current: Math.round(s.winRate), target: 55 }),
  },
  {
    id: 'pon_coringa',
    name: 'Coringa de Ponta',
    emoji: '🃏',
    rarity: 'rare',
    position: 'ponteiro',
    frame: frame('f_pon_coringa', 'Carta Estilizada', 'rare', 'stylized-card'),
    condition: (s, c) => {
      const rec = getPlayerRecommendation(c.player);
      const best = rec.allPositions[0].rating;
      const vers = rec.allPositions.filter(
        (p) => p.rating >= best - VUT_CONSTANTS.versatilityGap,
      ).length;
      return vers >= 3 && s.totalPoints >= 40;
    },
    progress: (s) => ({ current: s.totalPoints, target: 40 }),
  },
  {
    id: 'pon_pipoqueiro',
    name: 'Pipoqueiro',
    emoji: '🍿',
    rarity: 'legendary',
    position: 'ponteiro',
    frame: frame('f_pon_pipoqueiro', 'Dinâmica Viva', 'legendary', 'dynamic-alive'),
    condition: (s) => s.gamesPlayed >= 80,
    progress: (s) => ({ current: s.gamesPlayed, target: 80 }),
  },

  // ── Central ─────────────────────────────────────────────────────────────
  {
    id: 'cen_mao',
    name: 'Mão no Bloqueio',
    emoji: '🧱',
    rarity: 'common',
    position: 'central',
    frame: frame('f_cen_mao', 'Textura Tijolo', 'common', 'brick-texture'),
    condition: (s) => s.blocks >= 15,
    progress: (s) => ({ current: s.blocks, target: 15 }),
  },
  {
    id: 'cen_paredao',
    name: 'Paredão',
    emoji: '🏰',
    rarity: 'rare',
    position: 'central',
    frame: frame('f_cen_paredao', 'Muralha Torres', 'rare', 'wall-towers'),
    condition: (s) => s.blocks >= 40,
    progress: (s) => ({ current: s.blocks, target: 40 }),
  },
  {
    id: 'cen_intrans',
    name: 'Intransponível',
    emoji: '🗿',
    rarity: 'epic',
    position: 'central',
    frame: frame('f_cen_intrans', 'Pedra Monolítica', 'epic', 'monolith-stone'),
    condition: (s) => s.blocks >= 80,
    progress: (s) => ({ current: s.blocks, target: 80 }),
  },
  {
    id: 'cen_saida',
    name: 'Saída de Rede',
    emoji: '⚡',
    rarity: 'uncommon',
    position: 'central',
    frame: frame('f_cen_saida', 'Relâmpago Rápido', 'uncommon', 'quick-lightning'),
    condition: (s) => s.cortadas >= 30,
    progress: (s) => ({ current: s.cortadas, target: 30 }),
  },
  {
    id: 'cen_duplo',
    name: 'Bloqueio e Ataque',
    emoji: '💀',
    rarity: 'epic',
    position: 'central',
    frame: frame('f_cen_duplo', 'Crânio Estilizado', 'epic', 'stylized-skull'),
    condition: (s) => s.blocks >= 30 && s.cortadas >= 30,
    progress: (s) => ({ current: Math.min(s.blocks, s.cortadas), target: 30 }),
  },
  {
    id: 'cen_xerife',
    name: 'Xerife da Rede',
    emoji: '🔒',
    rarity: 'rare',
    position: 'central',
    frame: frame('f_cen_xerife', 'Cadeado Dourado', 'rare', 'golden-lock'),
    condition: (_s, c) => c.muralhaCount >= 3,
    progress: (_s, c) => ({ current: c.muralhaCount, target: 3 }),
  },
  {
    id: 'cen_saque',
    name: 'Central com Saque',
    emoji: '💥',
    rarity: 'uncommon',
    position: 'central',
    frame: frame('f_cen_saque', 'Onda de Choque', 'uncommon', 'shockwave'),
    condition: (s) => s.aces >= 10 && s.blocks >= 20,
    progress: (s) => ({ current: s.aces, target: 10 }),
  },
  {
    id: 'cen_torre',
    name: 'Torre',
    emoji: '🗼',
    rarity: 'rare',
    position: 'central',
    frame: frame('f_cen_torre', 'Estrutura Metálica', 'rare', 'metal-structure'),
    condition: (s, c) => (c.player.alturaCm ?? 0) >= 185 && s.blocks >= 20,
    progress: (s) => ({ current: s.blocks, target: 20 }),
  },
  {
    id: 'cen_dominou',
    name: 'Dominou a Rede',
    emoji: '👁️',
    rarity: 'epic',
    position: 'central',
    frame: frame('f_cen_dominou', 'Olho Vigilante', 'epic', 'watchful-eye'),
    condition: (s) => s.blocks >= 50 && s.winRate >= 55,
    progress: (s) => ({ current: s.blocks, target: 50 }),
  },
  {
    id: 'cen_selecao',
    name: 'Central de Seleção',
    emoji: '🦁',
    rarity: 'legendary',
    position: 'central',
    frame: frame('f_cen_selecao', 'Juba Real', 'legendary', 'royal-mane'),
    condition: (s) => s.blocks >= 60 && s.cortadas >= 40 && s.aces >= 10,
    progress: (s) => ({ current: Math.min(s.blocks / 6, s.cortadas / 4, s.aces), target: 10 }),
  },

  // ── Líbero ──────────────────────────────────────────────────────────────
  {
    id: 'lib_chao',
    name: 'Bom de Chão',
    emoji: '🤲',
    rarity: 'common',
    position: 'libero',
    frame: frame('f_lib_chao', 'Textura Piso', 'common', 'floor-texture'),
    condition: (_s, c) => c.defenseHighlights >= 10,
    progress: (_s, c) => ({ current: c.defenseHighlights, target: 10 }),
  },
  {
    id: 'lib_nao_cai',
    name: 'Não Cai Aqui',
    emoji: '🧱',
    rarity: 'rare',
    position: 'libero',
    frame: frame('f_lib_nao_cai', 'Muralha Compacta', 'rare', 'compact-wall'),
    condition: (_s, c) => c.defenseHighlights >= 30,
    progress: (_s, c) => ({ current: c.defenseHighlights, target: 30 }),
  },
  {
    id: 'lib_gato',
    name: 'Gato',
    emoji: '🐱',
    rarity: 'epic',
    position: 'libero',
    frame: frame('f_lib_gato', 'Felino Ágil', 'epic', 'agile-feline'),
    condition: (_s, c) => c.defenseHighlights + c.receptionHighlights >= 60,
    progress: (_s, c) => ({ current: c.defenseHighlights + c.receptionHighlights, target: 60 }),
  },
  {
    id: 'lib_barreira',
    name: 'Última Barreira',
    emoji: '🦸',
    rarity: 'rare',
    position: 'libero',
    frame: frame('f_lib_barreira', 'Capa de Herói', 'rare', 'hero-cape'),
    condition: (_s, c) => c.muralhaCount >= 3,
    progress: (_s, c) => ({ current: c.muralhaCount, target: 3 }),
  },
  {
    id: 'lib_seguranca',
    name: 'Segurança do Time',
    emoji: '🤫',
    rarity: 'uncommon',
    position: 'libero',
    frame: frame('f_lib_seguranca', 'Sombra Elegante', 'uncommon', 'elegant-shadow'),
    condition: (s, c) => s.highlights >= 20 && (c.formAvg ?? 0) >= 7.0,
    progress: (s) => ({ current: s.highlights, target: 20 }),
  },
  {
    id: 'lib_paredao',
    name: 'Paredão de Fundo',
    emoji: '🏗️',
    rarity: 'rare',
    position: 'libero',
    frame: frame('f_lib_paredao', 'Concreto Texturizado', 'rare', 'textured-concrete'),
    condition: (_s, c) => c.defenseHighlights + c.receptionHighlights >= 40,
    progress: (_s, c) => ({ current: c.defenseHighlights + c.receptionHighlights, target: 40 }),
  },
  {
    id: 'lib_nivel',
    name: 'Líbero de Nível',
    emoji: '⭐',
    rarity: 'epic',
    position: 'libero',
    frame: frame('f_lib_nivel', 'Estrela Prateada', 'epic', 'silver-star'),
    condition: (s) => s.highlights >= 50 && s.winRate >= 55,
    progress: (s) => ({ current: s.highlights, target: 50 }),
  },
  {
    id: 'lib_passe_a',
    name: 'Passe A',
    emoji: '💎',
    rarity: 'epic',
    position: 'libero',
    frame: frame('f_lib_passe_a', 'Diamante Azul', 'epic', 'blue-diamond'),
    condition: (_s, c) => (c.formAvg ?? 0) >= 7.5 && c.sessionsAttended >= 5,
    progress: (_s, c) => ({ current: c.sessionsAttended, target: 5 }),
  },
  {
    id: 'lib_sempre',
    name: 'Sempre na Quadra',
    emoji: '📅',
    rarity: 'rare',
    position: 'libero',
    frame: frame('f_lib_sempre', 'Calendário Brilho', 'rare', 'shining-calendar'),
    condition: (s, c) => c.sessionsAttended >= 30 && s.highlights >= 30,
    progress: (_s, c) => ({ current: c.sessionsAttended, target: 30 }),
  },
  {
    id: 'lib_lendario',
    name: 'Lendário de Fundo',
    emoji: '🛡️',
    rarity: 'legendary',
    position: 'libero',
    frame: frame('f_lib_lendario', 'Escudo Lendário', 'legendary', 'legendary-shield'),
    condition: (s) => s.highlights >= 80 && s.gamesPlayed >= 50,
    progress: (s) => ({ current: s.highlights, target: 80 }),
  },

  // ── All-Rounder ─────────────────────────────────────────────────────────
  {
    id: 'all_quebra',
    name: 'Quebra-Galho',
    emoji: '🔧',
    rarity: 'common',
    position: 'all-rounder',
    frame: frame('f_all_quebra', 'Ferramenta Limpa', 'common', 'clean-tool'),
    condition: (s) => s.totalPoints >= 10 && s.assists >= 5 && s.highlights >= 5,
    progress: (s) => ({
      current: Math.min(s.totalPoints, s.assists * 2, s.highlights * 2),
      target: 10,
    }),
  },
  {
    id: 'all_resolve',
    name: 'Resolve',
    emoji: '🔪',
    rarity: 'rare',
    position: 'all-rounder',
    frame: frame('f_all_resolve', 'Lâmina Afiada', 'rare', 'sharp-blade'),
    condition: (s) => s.totalPoints >= 30 && s.assists >= 15 && s.highlights >= 15,
    progress: (s) => ({
      current: Math.min(s.totalPoints / 2, s.assists, s.highlights),
      target: 15,
    }),
  },
  {
    id: 'all_tapa',
    name: 'Tapa Buraco de Luxo',
    emoji: '🃏',
    rarity: 'rare',
    position: 'all-rounder',
    frame: frame('f_all_tapa', 'Carta Premium', 'rare', 'premium-card'),
    condition: (_s, c) => {
      const rec = getPlayerRecommendation(c.player);
      const best = rec.allPositions[0].rating;
      return (
        rec.allPositions.filter((p) => p.rating >= best - VUT_CONSTANTS.versatilityGap).length >= 4
      );
    },
    progress: (_s, c) => {
      const rec = getPlayerRecommendation(c.player);
      const best = rec.allPositions[0].rating;
      return {
        current: rec.allPositions.filter((p) => p.rating >= best - VUT_CONSTANTS.versatilityGap)
          .length,
        target: 4,
      };
    },
  },
  {
    id: 'all_pouco',
    name: 'Um Pouco de Cada',
    emoji: '⚖️',
    rarity: 'epic',
    position: 'all-rounder',
    frame: frame('f_all_pouco', 'Balança Equilibrada', 'epic', 'balanced-scale'),
    condition: (s) => s.cortadas >= 10 && s.blocks >= 10 && s.aces >= 10 && s.highlights >= 10,
    progress: (s) => ({
      current: Math.min(s.cortadas, s.blocks, s.aces, s.highlights),
      target: 10,
    }),
  },
  {
    id: 'all_camaleao',
    name: 'Camaleão',
    emoji: '🦎',
    rarity: 'uncommon',
    position: 'all-rounder',
    frame: frame('f_all_camaleao', 'Muda de Cor', 'uncommon', 'color-shift'),
    condition: (s, c) => (c.player.posicoesSecundarias?.length ?? 0) >= 2 && s.gamesPlayed >= 30,
    progress: (s) => ({ current: s.gamesPlayed, target: 30 }),
  },
  {
    id: 'all_cola',
    name: 'Cola do Time',
    emoji: '🧲',
    rarity: 'rare',
    position: 'all-rounder',
    frame: frame('f_all_cola', 'Magneto Coesivo', 'rare', 'cohesive-magnet'),
    condition: (s) => s.winRate >= 60 && s.gamesPlayed >= 30,
    progress: (s) => ({ current: Math.round(s.winRate), target: 60 }),
  },
  {
    id: 'all_panelinha',
    name: 'Jogador de Panelinha',
    emoji: '🏐',
    rarity: 'common',
    position: 'all-rounder',
    frame: frame('f_all_panelinha', 'Esportiva Casual', 'common', 'casual-sport'),
    condition: (s, c) => s.totalPoints >= 50 && (c.formAvg ?? 0) >= 6.5,
    progress: (s) => ({ current: s.totalPoints, target: 50 }),
  },
  {
    id: 'all_polivalente',
    name: 'Polivalente',
    emoji: '🌈',
    rarity: 'epic',
    position: 'all-rounder',
    frame: frame('f_all_polivalente', 'Espectro Arco-Íris', 'epic', 'rainbow-spectrum'),
    condition: (s) =>
      s.aces >= 5 && s.blocks >= 5 && s.cortadas >= 10 && s.assists >= 5 && s.highlights >= 10,
    progress: (s) => ({
      current: Math.min(s.aces, s.blocks, s.cortadas / 2, s.assists, s.highlights / 2),
      target: 5,
    }),
  },
  {
    id: 'all_hora',
    name: 'Na Hora Certa',
    emoji: '🎰',
    rarity: 'uncommon',
    position: 'all-rounder',
    frame: frame('f_all_hora', 'Slot Dourado', 'uncommon', 'golden-slot'),
    condition: (_s, c) => c.highRatingGames >= 3,
    progress: (_s, c) => ({ current: c.highRatingGames, target: 3 }),
  },
  {
    id: 'all_faz_jogar',
    name: 'Faz o Time Jogar',
    emoji: '👻',
    rarity: 'legendary',
    position: 'all-rounder',
    frame: frame('f_all_faz_jogar', 'Translúcido Etéreo', 'legendary', 'ethereal-translucent'),
    condition: (s) => s.assists >= 15 && s.highlights >= 20 && s.balance >= 20,
    progress: (s) => ({ current: Math.min(s.assists, s.highlights / 1.33, s.balance), target: 15 }),
  },
];

// ─── Achievement resolution ────────────────────────────────────────────────

const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const ACHIEVEMENT_DESCRIPTIONS: Record<string, string> = {
  // Compartilhados
  shared_cria: 'Disputar pelo menos 50 jogos',
  shared_rodou: 'Disputar pelo menos 100 jogos',
  shared_presenca: 'Participar de pelo menos 20 sessões',
  shared_ponto: 'Marcar 100 pontos acumulados',
  shared_cestinha: 'Marcar 250 pontos acumulados',
  shared_placar: 'Manter taxa de vitória igual ou maior que 60% (mínimo de 30 jogos)',
  shared_quente: 'Manter nota recente igual ou superior a 7.5 em todas as últimas 5 partidas',
  shared_craque: 'Ganhar o prêmio de MVP da noite pelo menos 5 vezes',
  shared_qualquer: 'Ter versatilidade alta jogando bem em pelo menos 4 posições',
  shared_saldo: 'Manter um saldo acumulado de pontos menos erros de 50 ou mais',
  shared_selecao: 'Atingir overall de carta igual ou superior a 85',
  shared_sempre: 'Participar de pelo menos 30 sessões mantendo taxa de vitória mínima de 50%',

  // Levantador
  lev_bom: 'Dar pelo menos 10 assistências',
  lev_dono: 'Dar pelo menos 50 assistências',
  lev_cerebro: 'Dar pelo menos 100 assistências',
  lev_cara: 'Ganhar o prêmio de Maestro da noite pelo menos 3 vezes',
  lev_classe: 'Conquistar pelo menos 20 lances de destaque (highlights)',
  lev_pontua: 'Marcar pelo menos 15 pontos diretos combinando aces, largadas e bloqueios',
  lev_firme: 'Completar 20 jogos com média de erro por jogo inferior a 10%',
  lev_engrenagem: 'Dar pelo menos 10 assistências e ter no mínimo 20 jogos disputados',
  lev_frio: 'Manter nota média igual ou maior que 7.0 e dar no mínimo 30 assistências',
  lev_batuta: 'Ganhar pelo menos 3 prêmios de Maestro e no mínimo 1 prêmio de MVP da noite',

  // Oposto
  opo_braco: 'Marcar pelo menos 20 pontos de ataque (cortadas)',
  opo_canhao: 'Marcar pelo menos 50 pontos de ataque (cortadas)',
  opo_sem: 'Marcar pelo menos 100 pontos de ataque (cortadas)',
  opo_veneno: 'Marcar pelo menos 20 pontos de saque (aces)',
  opo_maquina: 'Marcar pelo menos 50 pontos de saque (aces)',
  opo_pontas:
    'Marcar pelo menos 50 pontos de ataque (cortadas) e no mínimo 20 pontos de saque (aces)',
  opo_decisivo: 'Ter no mínimo 5 jogos com nota igual ou superior a 8.5',
  opo_impacto: 'Marcar pelo menos 150 pontos acumulados na temporada',
  opo_completo: 'Marcar pelo menos 10 pontos de bloqueio, 30 cortadas e 10 aces',
  opo_dono:
    'Manter contribuição média de pontos por jogo igual ou superior a 25% (mínimo de 30 jogos)',

  // Ponteiro
  pon_passador: 'Conquistar pelo menos 20 lances de destaque (highlights) de recepção',
  pon_recebe_mata:
    'Marcar pelo menos 30 pontos de ataque (cortadas) e obter no mínimo 15 highlights de recepção',
  pon_ponta:
    'Marcar pelo menos 60 pontos de ataque (cortadas) e obter no mínimo 30 highlights gerais',
  pon_viagem: 'Marcar pelo menos 15 pontos de saque (aces)',
  pon_faz_tudo: 'Obter no mínimo 20 cortadas, 10 aces, 10 bloqueios e 10 highlights gerais',
  pon_ferro: 'Obter pelo menos 40 highlights somando recepções e defesas',
  pon_nota: 'Manter nota média igual ou maior que 7.0 e marcar no mínimo 30 pontos acumulados',
  pon_ganhou: 'Manter taxa de vitória igual ou maior que 55% (mínimo de 20 jogos)',
  pon_coringa: 'Ter versatilidade mínima de 3 posições e marcar pelo menos 40 pontos',
  pon_pipoqueiro: 'Completar pelo menos 80 jogos disputados acumulados',

  // Central
  cen_mao: 'Marcar pelo menos 15 pontos de bloqueio',
  cen_paredao: 'Marcar pelo menos 40 pontos de bloqueio',
  cen_intrans: 'Marcar pelo menos 80 pontos de bloqueio',
  cen_saida: 'Marcar pelo menos 30 pontos de ataque (cortadas)',
  cen_duplo: 'Marcar pelo menos 30 pontos de bloqueio e no mínimo 30 pontos de ataque (cortadas)',
  cen_xerife: 'Ganhar o prêmio de Muralha da noite pelo menos 3 vezes',
  cen_saque: 'Marcar pelo menos 10 aces e obter no mínimo 20 pontos de bloqueio',
  cen_torre: 'Ter altura igual ou maior que 1.85m e no mínimo 20 pontos de bloqueio',
  cen_dominou: 'Marcar pelo menos 50 pontos de bloqueio mantendo taxa de vitória de 55%',
  cen_selecao: 'Marcar pelo menos 60 pontos de bloqueio, 40 cortadas e 10 aces',

  // Líbero
  lib_chao: 'Obter pelo menos 10 highlights de defesa',
  lib_nao_cai: 'Obter pelo menos 30 highlights de defesa',
  lib_gato: 'Obter pelo menos 60 highlights somando defesas e recepções',
  lib_barreira: 'Ganhar o prêmio de Muralha da noite pelo menos 3 vezes',
  lib_seguranca:
    'Obter no mínimo 20 highlights gerais e manter nota média de forma igual ou maior que 7.0',
  lib_paredao: 'Obter pelo menos 40 highlights somando defesas e recepções',
  lib_nivel: 'Obter no mínimo 50 highlights gerais mantendo taxa de vitória mínima de 55%',
  lib_passe_a: 'Manter nota média de forma igual ou maior que 7.5 (mínimo de 5 sessões)',
  lib_sempre: 'Participar de pelo menos 30 sessões obtendo no mínimo 30 highlights gerais',
  lib_lendario: 'Obter no mínimo 80 highlights gerais e ter pelo menos 50 jogos disputados',

  // All-Rounder
  all_quebra: 'Marcar pelo menos 10 pontos, dar 5 assistências e obter 5 highlights gerais',
  all_resolve: 'Marcar pelo menos 30 pontos, dar 15 assistências e obter 15 highlights gerais',
  all_tapa: 'Ter versatilidade alta jogando bem em pelo menos 4 posições',
  all_pouco: 'Marcar pelo menos 10 cortadas, 10 bloqueios, 10 aces e obter 10 highlights gerais',
  all_camaleao: 'Atuar em pelo menos 2 posições secundárias com no mínimo 30 jogos disputados',
  all_cola: 'Manter taxa de vitória igual ou maior que 60% com pelo menos 30 jogos disputados',
  all_panelinha: 'Marcar pelo menos 50 pontos mantendo nota média de forma igual ou maior que 6.5',
  all_polivalente:
    'Marcar no mínimo 5 aces, 5 bloqueios, 10 cortadas, dar 5 assistências e obter 10 highlights',
  all_hora: 'Ter pelo menos 3 jogos disputados com nota individual igual ou superior a 8.0',
  all_faz_jogar:
    'Dar no mínimo 15 assistências, obter 20 highlights e manter saldo positivo mínimo de 20',
};

/** Resolve all achievements for a player: filter by position, evaluate conditions. */
export function resolveAchievements(
  player: Player,
  stats: PlayerStats,
  ctx: AchievementContext,
): Achievement[] {
  const pos = player.posicaoPrincipal;
  const applicable = ACHIEVEMENT_CATALOG.filter((a) => a.position === 'all' || a.position === pos);

  return applicable.map((def) => {
    const unlocked = def.condition(stats, ctx);
    const { current, target } = def.progress(stats, ctx);
    return {
      id: def.id,
      name: def.name,
      emoji: def.emoji,
      rarity: def.rarity,
      frame: def.frame,
      unlocked,
      current,
      target,
      position: def.position,
      description: ACHIEVEMENT_DESCRIPTIONS[def.id] || '',
    };
  });
}

/** Pick the rarest unlocked frame, or default. */
export function resolveCardFrame(achievements: Achievement[]): CardFrame {
  const unlocked = achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);

  return unlocked.length > 0 ? unlocked[0].frame : DEFAULT_FRAME;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveLastSessionContext(
  player: Player,
  ctx: BuildVutCardContext,
): EditionContext | null {
  // Find the last finished session where this player participated.
  const finishedSessions = ctx.sessions
    .filter((s) => s.status === 'finished')
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const session of finishedSessions) {
    const sessionTeams = ctx.teams.filter((t) => t.sessionId === session.id);
    if (!sessionTeams.some((t) => t.playerIds.includes(player.id))) continue;

    const sessionPoints = ctx.pointEvents.filter((p) => p.sessionId === session.id);
    const sessionGames = ctx.games.filter(
      (g) => g.sessionId === session.id && g.status === 'finished',
    );

    // Get all participants in this session.
    const participantIds = new Set(sessionTeams.flatMap((t) => t.playerIds));
    const participants = ctx.players.filter((p) => participantIds.has(p.id));

    return {
      lastSessionPoints: sessionPoints,
      lastSessionGames: sessionGames,
      lastSessionTeams: sessionTeams,
      participants,
    };
  }

  return null;
}
