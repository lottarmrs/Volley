import type { OperationalPhase } from '@domain/sessionPhase';

export const NEW_PLAYER_ID = 'novo';

export const LIVE_SESSION_PHASES: OperationalPhase[] = [
  'times_gerados',
  'pronta',
  'entre_partidas',
  'em_andamento',
  'pausada',
];

export const paths = {
  painel: '/painel',
  agenda: '/agenda',
  comunidades: '/comunidades',
  perfil: '/perfil',
  perfilSync: '/perfil/sync',
  admin: '/admin',
  sessaoAtivaSemComunidade: '/sessao/ativa',
  comunidade: (communityId: string) => `/comunidades/${communityId}`,
  sessoes: (communityId: string) => `/comunidades/${communityId}/sessoes`,
  sessaoNova: (communityId: string, type?: 'tournament' | 'free_play') =>
    type === 'tournament'
      ? `/comunidades/${communityId}/sessoes/nova?tipo=torneio`
      : `/comunidades/${communityId}/sessoes/nova`,
  sessaoAtiva: (communityId: string) => `/comunidades/${communityId}/sessoes/ativa`,
  torneios: (communityId: string) => `/comunidades/${communityId}/sessoes/torneios`,
  sessao: (communityId: string, sessionId: string) =>
    `/comunidades/${communityId}/sessoes/${sessionId}`,
  pessoas: (communityId: string) => `/comunidades/${communityId}/pessoas`,
  atleta: (communityId: string, playerId: string) =>
    `/comunidades/${communityId}/pessoas/editar-atleta/${playerId}`,
  desempenho: (
    communityId: string,
    options?: { aba?: 'ranking' | 'historico'; sessao?: string },
  ) => {
    const base = `/comunidades/${communityId}/desempenho`;
    const query = new URLSearchParams();
    if (options?.sessao) {
      query.set('aba', 'historico');
      query.set('sessao', options.sessao);
    } else if (options?.aba) {
      query.set('aba', options.aba);
    }
    const suffix = query.toString();
    return suffix ? `${base}?${suffix}` : base;
  },
  gestao: (communityId: string) => `/comunidades/${communityId}/gestao`,
} as const;

export type RouteResolution = { kind: 'ok' } | { kind: 'redirect'; to: string };

function segmentsOf(pathname: string): string[] {
  return pathname.split('?')[0].split('/').filter(Boolean);
}

export function extractCommunityId(pathname: string): string | null {
  const segments = segmentsOf(pathname);
  if (segments[0] !== 'comunidades' || !segments[1]) return null;
  return segments[1];
}

export function resolveCommunityRoute(input: {
  communityId?: string;
  communityIds: string[];
}): RouteResolution {
  if (input.communityId && input.communityIds.includes(input.communityId)) return { kind: 'ok' };
  return { kind: 'redirect', to: paths.comunidades };
}

export function resolveLiveSessionRoute(input: {
  communityId: string;
  activeSessionCommunityId?: string | null;
  hasActiveSession: boolean;
  phase: OperationalPhase;
}): RouteResolution {
  if (!input.hasActiveSession || !LIVE_SESSION_PHASES.includes(input.phase)) {
    return { kind: 'redirect', to: paths.sessoes(input.communityId) };
  }
  const owner = input.activeSessionCommunityId ?? null;
  if (owner === null) return { kind: 'redirect', to: paths.sessaoAtivaSemComunidade };
  if (owner !== input.communityId) return { kind: 'redirect', to: paths.sessaoAtiva(owner) };
  return { kind: 'ok' };
}

export function resolveLegacyLiveSessionRoute(input: {
  activeSessionCommunityId?: string | null;
  hasActiveSession: boolean;
  phase: OperationalPhase;
}): RouteResolution {
  if (!input.hasActiveSession || !LIVE_SESSION_PHASES.includes(input.phase)) {
    return { kind: 'redirect', to: paths.painel };
  }
  const owner = input.activeSessionCommunityId ?? null;
  if (owner !== null) return { kind: 'redirect', to: paths.sessaoAtiva(owner) };
  return { kind: 'ok' };
}

export function resolveAdminRoute(input: { isStaff: boolean }): RouteResolution {
  return input.isStaff ? { kind: 'ok' } : { kind: 'redirect', to: paths.painel };
}

export function resolveWizardRoute(input: {
  communityId: string;
  hasActiveSession: boolean;
  activeSessionCommunityId?: string | null;
  phase: OperationalPhase;
}): { kind: 'create' | 'adopt' | 'ok' } | { kind: 'redirect'; to: string } {
  if (!input.hasActiveSession) return { kind: 'create' };
  const owner = input.activeSessionCommunityId ?? null;
  if (LIVE_SESSION_PHASES.includes(input.phase)) {
    return {
      kind: 'redirect',
      to: owner === null ? paths.sessaoAtivaSemComunidade : paths.sessaoAtiva(owner),
    };
  }
  if (owner === null) return { kind: 'adopt' };
  if (owner === input.communityId) return { kind: 'ok' };
  return { kind: 'redirect', to: paths.sessaoNova(owner) };
}

export function resolvePlayerRoute(input: {
  param?: string;
  players: Array<{ id: string; username?: string }>;
}): { kind: 'ok'; playerId: string } | { kind: 'new' } | { kind: 'not-found' } {
  if (!input.param) return { kind: 'not-found' };
  if (input.param === NEW_PLAYER_ID) return { kind: 'new' };
  const byId = input.players.find((player) => player.id === input.param);
  if (byId) return { kind: 'ok', playerId: byId.id };
  const target = input.param.toLowerCase();
  const byHandle = input.players.find((player) => player.username?.toLowerCase() === target);
  if (byHandle) return { kind: 'ok', playerId: byHandle.id };
  return { kind: 'not-found' };
}

export type PlayerEditAction = 'none' | 'add-new' | 'edit-existing';

export function resolvePlayerEditAction(input: {
  playerId?: string;
  targetPlayerId?: string;
  editingPlayerId?: string;
  hasEditingPlayer: boolean;
}): PlayerEditAction {
  if (!input.playerId) return 'none';
  if (input.targetPlayerId && input.editingPlayerId === input.targetPlayerId) return 'none';
  if (input.playerId === NEW_PLAYER_ID) {
    return input.hasEditingPlayer ? 'none' : 'add-new';
  }
  if (input.targetPlayerId) return 'edit-existing';
  return 'none';
}

export function resolveNewSessionPath(input: {
  communityIds: string[];
  type?: 'tournament' | 'free_play';
}): string {
  if (input.communityIds.length === 1) return paths.sessaoNova(input.communityIds[0], input.type);
  return paths.comunidades;
}

export function resolveBackTarget(input: {
  locationKey: string;
  fallbackPath: string;
}): { kind: 'history' } | { kind: 'path'; to: string } {
  if (input.locationKey === 'default') return { kind: 'path', to: input.fallbackPath };
  return { kind: 'history' };
}

export type LegacyPage =
  | 'dashboard'
  | 'players'
  | 'player-edit'
  | 'session-wizard'
  | 'session-active'
  | 'history'
  | 'communities';

export function pathForLegacyPage(page: LegacyPage, communityId: string | null): string {
  switch (page) {
    case 'session-wizard':
      return communityId ? paths.sessaoNova(communityId) : paths.comunidades;
    case 'session-active':
      return communityId ? paths.sessaoAtiva(communityId) : paths.sessaoAtivaSemComunidade;
    case 'players':
      return communityId ? paths.pessoas(communityId) : paths.comunidades;
    case 'player-edit':
      return communityId ? paths.atleta(communityId, NEW_PLAYER_ID) : paths.comunidades;
    case 'history':
      return communityId ? paths.desempenho(communityId, { aba: 'historico' }) : paths.painel;
    case 'communities':
      return paths.comunidades;
    case 'dashboard':
    default:
      return paths.painel;
  }
}

export function getPageTitleForPath(pathname: string): string {
  const segments = segmentsOf(pathname);
  if (segments.length === 0 || segments[0] === 'painel') return 'Painel de Controle';
  if (segments[0] === 'agenda') return 'Agenda';
  if (segments[0] === 'perfil')
    return segments[1] === 'sync' ? 'Sincronização & Backup Nuvem' : 'Meu Perfil';
  if (segments[0] === 'admin') return 'Administração da Plataforma';
  if (segments[0] === 'sessao' && segments[1] === 'ativa') return 'Sessão em Andamento';
  if (segments[0] !== 'comunidades') return 'Panelinha';
  if (segments.length === 1) return 'Comunidades';
  if (segments.length === 2) return 'Visão Geral da Comunidade';

  switch (segments[2]) {
    case 'sessoes':
      if (segments.length === 3) return 'Sessões';
      if (segments[3] === 'nova') return 'Configuração da Sessão';
      if (segments[3] === 'ativa') return 'Sessão em Andamento';
      if (segments[3] === 'torneios') return 'Torneios & Campeonatos';
      return 'Detalhe da Sessão';
    case 'pessoas':
      return segments[3] === 'editar-atleta' ? 'Perfil do Atleta' : 'Pessoas';
    case 'desempenho':
      return 'Desempenho';
    case 'gestao':
      return 'Gestão da Comunidade';
    default:
      return 'Panelinha';
  }
}

export interface ShellNavItem {
  id: string;
  label: string;
  icon:
    | 'dashboard'
    | 'tournament'
    | 'players'
    | 'ranking'
    | 'history'
    | 'cloud'
    | 'settings'
    | 'admin';
  to: string;
  active: boolean;
  badge?: number;
}

export function getShellNavigationItems(input: {
  pathname: string;
  isStaff: boolean;
  pendingChanges: number;
}): ShellNavItem[] {
  const communityId = extractCommunityId(input.pathname);
  const path = input.pathname.split('?')[0];

  if (communityId) {
    const area = segmentsOf(path)[2] ?? null;
    return [
      {
        id: 'comunidade-visao-geral',
        label: 'Visão geral',
        icon: 'dashboard',
        to: paths.comunidade(communityId),
        active: area === null,
      },
      {
        id: 'comunidade-sessoes',
        label: 'Sessões',
        icon: 'tournament',
        to: paths.sessoes(communityId),
        active: area === 'sessoes',
      },
      {
        id: 'comunidade-pessoas',
        label: 'Pessoas',
        icon: 'players',
        to: paths.pessoas(communityId),
        active: area === 'pessoas',
      },
      {
        id: 'comunidade-desempenho',
        label: 'Desempenho',
        icon: 'ranking',
        to: paths.desempenho(communityId),
        active: area === 'desempenho',
      },
      {
        id: 'comunidade-gestao',
        label: 'Gestão',
        icon: 'settings',
        to: paths.gestao(communityId),
        active: area === 'gestao',
      },
      {
        id: 'voltar-comunidades',
        label: 'Comunidades',
        icon: 'history',
        to: paths.comunidades,
        active: false,
      },
    ];
  }

  const items: ShellNavItem[] = [
    {
      id: 'painel',
      label: 'Início',
      icon: 'dashboard',
      to: paths.painel,
      active: path === paths.painel,
    },
    {
      id: 'agenda',
      label: 'Agenda',
      icon: 'history',
      to: paths.agenda,
      active: path === paths.agenda,
    },
    {
      id: 'comunidades',
      label: 'Comunidades',
      icon: 'players',
      to: paths.comunidades,
      active: path === paths.comunidades,
    },
    {
      id: 'perfil',
      label: 'Meu perfil',
      icon: 'cloud',
      to: paths.perfil,
      active: path.startsWith(paths.perfil),
      badge: input.pendingChanges > 0 ? input.pendingChanges : undefined,
    },
  ];

  if (input.isStaff) {
    items.push({
      id: 'admin',
      label: 'Administração',
      icon: 'admin',
      to: paths.admin,
      active: path === paths.admin,
    });
  }

  return items;
}
