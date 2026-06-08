import { CommunityPresence, CommunityPresenceItem, CommunityPresenceStatus, Player } from '../types';
import { calculateTeamStrength } from './calculations';
import { getPlayerDisplayName } from './community';

export function getPresenceItem(presence: CommunityPresence | null, playerId: string) {
  return presence?.items.find(item => item.playerId === playerId);
}

export function getPresenceStatus(presence: CommunityPresence | null, playerId: string): CommunityPresenceStatus {
  return getPresenceItem(presence, playerId)?.status || 'unmarked';
}

export function setPresenceItemStatus(
  presence: CommunityPresence,
  playerId: string,
  status: CommunityPresenceStatus
): CommunityPresence {
  const exists = presence.items.some(item => item.playerId === playerId);
  const items = exists
    ? presence.items.map(item => item.playerId === playerId ? { ...item, status } : item)
    : [...presence.items, { playerId, status }];

  return {
    ...presence,
    items,
    updatedAt: new Date().toISOString(),
  };
}

export function addGuestToPresence(presence: CommunityPresence, temporaryName: string): CommunityPresence {
  const name = temporaryName.trim();
  if (!name) return presence;
  return {
    ...presence,
    items: [...presence.items, { temporaryName: name, status: 'guest' }],
    updatedAt: new Date().toISOString(),
  };
}

export function getPresenceGroups(presence: CommunityPresence | null, players: Player[]) {
  const statusFor = (player: Player) => getPresenceStatus(presence, player.id);
  const present = players.filter(player => statusFor(player) === 'present');
  const absent = players.filter(player => statusFor(player) === 'absent');
  const maybe = players.filter(player => statusFor(player) === 'maybe');
  const unmarked = players.filter(player => statusFor(player) === 'unmarked');
  const guests = presence?.items.filter(item => item.status === 'guest') || [];

  return { present, absent, maybe, unmarked, guests };
}

export function getPresenceSummary(presence: CommunityPresence | null, players: Player[]) {
  const groups = getPresenceGroups(presence, players);
  const strength = calculateTeamStrength(groups.present);
  const byPosition = groups.present.reduce<Record<string, number>>((acc, player) => {
    acc[player.posicaoPrincipal] = (acc[player.posicaoPrincipal] || 0) + 1;
    return acc;
  }, {});

  return {
    presentCount: groups.present.length + groups.guests.length,
    absentCount: groups.absent.length,
    maybeCount: groups.maybe.length,
    unmarkedCount: groups.unmarked.length,
    averageOverall: strength.overall,
    averageHeight: strength.averageHeight,
    byPosition,
    restrictedCount: groups.present.filter(player => player.status.lesionado || player.status.limitacaoFisica).length,
  };
}

export function getPresenceAlerts(presence: CommunityPresence | null, players: Player[]) {
  const groups = getPresenceGroups(presence, players);
  const alerts: string[] = [];
  const setters = groups.present.filter(player => player.posicaoPrincipal === 'levantador' || player.atributos.levantamento >= 7).length;
  const netPlayers = groups.present.filter(player => player.posicaoPrincipal === 'central' || player.atributos.bloqueio >= 7 || player.atributos.ataque >= 7).length;
  const defenders = groups.present.filter(player => player.posicaoPrincipal === 'libero' || player.atributos.recepcao >= 7 || player.atributos.defesa >= 7).length;
  const total = groups.present.length + groups.guests.length;

  if (setters < 2) alerts.push('Poucos levantadores presentes.');
  if (total > 0 && total % 2 !== 0 && total % 3 !== 0) alerts.push('O numero de presentes pode dificultar times iguais.');
  if (groups.present.some(player => player.status.lesionado || player.status.limitacaoFisica)) alerts.push('Ha atletas com limitacao fisica.');
  if (netPlayers < 2) alerts.push('Poucos jogadores de rede presentes.');
  if (defenders < 2) alerts.push('Poucos defensores/recebedores presentes.');

  return alerts;
}

function formatPlayerList(players: Player[], fallback: string) {
  if (players.length === 0) return fallback;
  return players.map((player, index) => `${index + 1}. ${getPlayerDisplayName(player)}`).join('\n');
}

function formatGuestList(guests: CommunityPresenceItem[]) {
  return guests
    .map((guest, index) => `${index + 1}. ${guest.temporaryName || 'Convidado'}`)
    .join('\n');
}

export function formatPresenceText(communityName: string, presence: CommunityPresence | null, players: Player[]) {
  const groups = getPresenceGroups(presence, players);
  const summary = getPresenceSummary(presence, players);
  const guests = formatGuestList(groups.guests);

  return [
    `Presenca - ${communityName}`,
    ``,
    `Presentes:`,
    formatPlayerList(groups.present, 'Sem presentes marcados.'),
    guests ? `\nConvidados:\n${guests}` : '',
    ``,
    `Talvez:`,
    formatPlayerList(groups.maybe, 'Sem talvez.'),
    ``,
    `Ausentes:`,
    formatPlayerList(groups.absent, 'Sem ausentes.'),
    ``,
    `Resumo:`,
    `Presentes: ${summary.presentCount}`,
    `Talvez: ${summary.maybeCount}`,
    `Ausentes: ${summary.absentCount}`,
  ].filter(Boolean).join('\n');
}
