import { Community, CommunityRanking, CommunitySummary, Player, Session } from '../types';
import { getPlayerDisplayName } from './community';

export function formatCommunitySummaryText(community: Community, summary: CommunitySummary) {
  return [
    `Resumo - ${community.name}`,
    ``,
    `Local: ${community.defaultLocation || 'Nao informado'}`,
    `Dia: ${community.defaultDay || 'Nao informado'}`,
    `Horario: ${community.defaultStartTime || '--'} ${community.defaultEndTime ? `as ${community.defaultEndTime}` : ''}`.trim(),
    ``,
    `Atletas vinculados: ${summary.totalAthletes}`,
    `Atletas ativos: ${summary.activeAthletes}`,
    `Sessoes realizadas: ${summary.totalSessions}`,
    `Partidas registradas: ${summary.totalMatches}`,
    `Pontos registrados: ${summary.totalPoints}`,
    summary.lastMvpName ? `Ultimo MVP: ${summary.lastMvpName}` : '',
  ].filter(Boolean).join('\n');
}

export function formatCommunityPlayersText(community: Community, players: Player[]) {
  return [
    `Atletas - ${community.name}`,
    ``,
    players.map((player, index) => `${index + 1}. ${getPlayerDisplayName(player)} - ${player.posicaoPrincipal}`).join('\n') || 'Nenhum atleta vinculado.',
    ``,
    `Total: ${players.length} atletas`,
  ].join('\n');
}

export function formatCommunityRankingText(community: Community, ranking: CommunityRanking, limit = 5) {
  return [
    `Ranking - ${community.name}`,
    ``,
    ranking.rows.slice(0, limit).map((row, index) => (
      `${index + 1}. ${row.playerName} - ${row.totalPoints} pts | ${row.wins}V | presenca ${row.presenceRate}%`
    )).join('\n') || 'Sem dados de ranking.',
  ].join('\n');
}

export function formatCommunitySessionsText(community: Community, sessions: Session[]) {
  return [
    `Sessoes - ${community.name}`,
    ``,
    sessions.map((session, index) => (
      `${index + 1}. ${session.name} - ${new Date(`${session.date}T12:00:00`).toLocaleDateString('pt-BR')} - ${session.type === 'tournament' ? 'Campeonato' : 'Jogo Livre'}`
    )).join('\n') || 'Nenhuma sessao registrada.',
  ].join('\n');
}
