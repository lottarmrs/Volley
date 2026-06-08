import { GameReport, SessionReport, Game, Team, Player, PointEvent, Division } from "../types";
import { TournamentStanding, TournamentMVP } from "./tournament";

export function formatGameReportForWhatsApp(report: GameReport): string {
  const sortedPlayers = [...report.playerStats]
    .filter(p => p.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const topPlayers = sortedPlayers
    .slice(0, 5)
    .map((p, index) => `${index + 1}. ${p.playerName} — ${p.totalPoints} pts`)
    .join("\n");

  return [
    `🏐 *Panelinha — Jogo ${report.sequenceNumber}*`,
    ``,
    `*${report.teamA.name}* ${report.teamA.score} x ${report.teamB.score} *${report.teamB.name}*`,
    ``,
    `🏆 Vencedor: *${report.winnerTeamName}*`,
    ``,
    `⚡ *Pontuadores do jogo*`,
    topPlayers || `Sem pontuação individual registrada.`,
    ``,
    `Gerado pelo Panelinha 🏐`
  ].join("\n");
}

export function formatSessionReportForWhatsApp(report: SessionReport): string {
  const standings = report.teamStandings
    .map((team, index) => {
      const saldo = team.pointDifference > 0 ? `+${team.pointDifference}` : `${team.pointDifference}`;
      return `${index + 1}º ${team.teamName} — ${team.wins}V / ${team.losses}D | Saldo ${saldo}`;
    })
    .join("\n");

  const ranking = report.playerRanking
    .slice(0, 5)
    .map((player, index) => `${index + 1}. ${player.playerName} — ${player.totalPoints} pts`)
    .join("\n");

  const gamesList = report.games
    .map(game => `#${game.sequenceNumber} — ${game.teamA.name} ${game.teamA.score} x ${game.teamB.score} ${game.teamB.name}`)
    .join("\n");

  const tieBreakLabel =
    report.rules.tieBreakMethod === "direct_3"
      ? "3 direto"
      : "vai a 2";

  return [
    `🏐 *Resumo da Noite — ${report.sessionName}*`,
    ``,
    `📅 ${new Date(report.date).toLocaleDateString("pt-BR")}`,
    `🎮 Formato: ${report.type === "free_play" ? "Jogo Livre" : "Torneio"}`,
    `🎯 Regra: até ${report.rules.maxPoints} pontos · ${tieBreakLabel}`,
    ``,
    `🏆 *Classificação Final*`,
    standings || `Sem classificação registrada.`,
    ``,
    `🔥 *Top Pontuadores*`,
    ranking || `Sem pontuação individual registrada.`,
    ``,
    `📋 *Jogos*`,
    gamesList || `Nenhum jogo finalizado.`,
    ``,
    `Gerado pelo Panelinha 🏐`
  ].join("\n");
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Falha ao copiar:', err);
    return false;
  }
}

export function openWhatsAppShare(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

export function formatTournamentFinalForWhatsApp(input: {
  sessionName: string;
  standings: TournamentStanding[];
  teams: Team[];
  players: Player[];
  scoringRanking: { playerId: string; points: number }[];
  mvp: TournamentMVP | null;
}): string {
  const champion = input.standings[0];
  const runnerUp = input.standings[1];
  const championName = input.teams.find(t => t.id === champion?.teamId)?.name || "Time";
  const runnerUpName = input.teams.find(t => t.id === runnerUp?.teamId)?.name || "Time";
  const mvpName = input.mvp?.playerName || "Sem MVP";
  const mvpPoints = input.mvp?.totalPoints || 0;

  const standings = input.standings
    .map((team, index) => {
      const teamName = input.teams.find(t => t.id === team.teamId)?.name || "Time";
      return `${index + 1}º ${teamName} — ${team.classificationPoints} pts`;
    })
    .join("\n");

  const scorers = input.scoringRanking
    .slice(0, 5)
    .map((rank, index) => {
      const playerName = input.players.find(p => p.id === rank.playerId)?.apelido || input.players.find(p => p.id === rank.playerId)?.nome || "Atleta";
      return `${index + 1}. ${playerName} — ${rank.points} pts`;
    })
    .join("\n");

  return [
    `🏆 Torneio finalizado`,
    ``,
    `Campeão: ${championName}`,
    `Vice: ${runnerUpName}`,
    `MVP: ${mvpName} — ${mvpPoints} pontos`,
    ``,
    `Classificação final:`,
    standings || `Sem classificação registrada.`,
    ``,
    `Artilharia:`,
    scorers || `Sem pontuação individual registrada.`,
    ``,
    `Gerado pelo Panelinha.`
  ].join("\n");
}

export function formatTournamentStandingsForWhatsApp(input: {
  sessionName: string;
  standings: TournamentStanding[];
  teams: Team[];
}): string {
  const standings = input.standings
    .map((team, index) => {
      const teamName = input.teams.find(t => t.id === team.teamId)?.name || "Time";
      const saldo = team.pointDifference > 0 ? `+${team.pointDifference}` : `${team.pointDifference}`;
      return `${index + 1}º ${teamName} — ${team.classificationPoints} pts | ${team.wins}V | saldo ${saldo}`;
    })
    .join("\n");

  return [
    `🏐 Classificação parcial`,
    ``,
    standings || `Sem classificação registrada.`,
    ``,
    `Gerado pelo Panelinha.`
  ].join("\n");
}

export function formatTournamentScorersForWhatsApp(input: {
  sessionName: string;
  players: Player[];
  scoringRanking: { playerId: string; points: number }[];
}): string {
  const scorers = input.scoringRanking
    .slice(0, 10)
    .map((rank, index) => {
      const playerName = input.players.find(p => p.id === rank.playerId)?.apelido || input.players.find(p => p.id === rank.playerId)?.nome || "Atleta";
      return `${index + 1}. ${playerName} — ${rank.points} pts`;
    })
    .join("\n");

  return [
    `🔥 Artilharia — ${input.sessionName}`,
    ``,
    scorers || `Sem pontuação individual registrada.`,
    ``,
    `Gerado pelo Panelinha.`
  ].join("\n");
}

export function formatTournamentGameForWhatsApp(input: {
  game: Game;
  teams: Team[];
  players: Player[];
  points: PointEvent[];
}): string {
  const teamA = input.teams.find(t => t.id === input.game.teamAId);
  const teamB = input.teams.find(t => t.id === input.game.teamBId);
  const winner = input.teams.find(t => t.id === input.game.winnerTeamId);
  const gamePoints = input.points.filter(p => p.gameId === input.game.id);
  const playerTotals = gamePoints.reduce<Record<string, number>>((acc, point) => {
    if (!point.playerId) return acc;
    acc[point.playerId] = (acc[point.playerId] || 0) + 1;
    return acc;
  }, {});
  const highlights = Object.entries(playerTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([playerId, total], index) => {
      const player = input.players.find(p => p.id === playerId);
      const name = player?.apelido || player?.nome || "Atleta";
      return `${index + 1}. ${name} — ${total} pts`;
    })
    .join("\n");

  return [
    `🏐 Resultado do jogo`,
    ``,
    `${teamA?.name || "Time A"} ${input.game.scoreA} x ${input.game.scoreB} ${teamB?.name || "Time B"}`,
    ``,
    `Vencedor: ${winner?.name || "A definir"}`,
    ``,
    `Destaques:`,
    highlights || `Sem pontuação individual registrada.`,
    ``,
    `Gerado pelo Panelinha.`
  ].join("\n");
}

export function formatDrawForWhatsApp(
  sessionName: string,
  divisions: Division[],
  players: Player[]
): string {
  const formattedDivisions = divisions
    .map((div, divIdx) => {
      const teamsFormatted = div.teams
        .map(team => {
          const teamPlayers = team.playerIds
            .map(pid => {
              const p = players.find(x => x.id === pid);
              if (!p) return "";
              const name = p.apelido || p.nome;
              const pos = p.posicaoPrincipal ? ` (${p.posicaoPrincipal})` : "";
              return `- ${name}${pos}`;
            })
            .filter(Boolean)
            .join("\n");

          const rating = team.strengthSnapshot?.overall
            ? ` (Rating: ${Math.round(team.strengthSnapshot.overall)})`
            : "";

          return `*${team.name}*${rating}:\n${teamPlayers}`;
        })
        .join("\n\n");

      const quality = div.qualityLabel || `Opção ${divIdx + 1}`;
      return `📌 *Opção ${divIdx + 1} (${quality})*\n\n${teamsFormatted}`;
    })
    .join("\n\n════════════════════\n\n");

  return [
    `🏐 *Sorteio de Times — ${sessionName}*`,
    ``,
    `Opções de equipes equilibradas geradas pelo Panelinha:`,
    ``,
    formattedDivisions,
    ``,
    `Gerado pelo Panelinha 🏐`
  ].join("\n");
}

export function formatScheduledMatchForWhatsApp(input: {
  game: Game;
  teams: Team[];
  sessionName: string;
}): string {
  const teamA = input.teams.find(t => t.id === input.game.teamAId)?.name || "Time A";
  const teamB = input.teams.find(t => t.id === input.game.teamBId)?.name || "Time B";

  const roundText = input.game.round ? ` — Rodada ${input.game.round}` : "";
  const stageText = input.game.stage && input.game.stage !== "free_play" && input.game.stage !== "group"
    ? ` [${input.game.stage.toUpperCase()}]`
    : "";

  return [
    `🏐 *Próxima Partida — ${input.sessionName}*`,
    ``,
    `🔥 *${teamA}* vs *${teamB}*${roundText}${stageText}`,
    ``,
    `Preparem-se para entrar em quadra!`,
    ``,
    `Acompanhe no Panelinha 🏐`
  ].join("\n");
}
