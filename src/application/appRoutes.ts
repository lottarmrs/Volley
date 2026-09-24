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
  comecar: '/comecar',
  resumo: '/pelada/resumo',
  agenda: '/agenda',
  ligas: '/ligas',
  ligaNova: '/ligas/nova',
  liga: (championshipId: string) => `/ligas/${championshipId}`,
  comunidades: '/comunidades',
  perfil: '/perfil',
  perfilSync: '/perfil/sync',
  plataforma: '/plataforma',
  sessaoAtivaSemComunidade: '/sessao/ativa',
  comunidade: (communityId: string) => `/comunidades/${communityId}`,
  sessoes: (communityId: string) => `/comunidades/${communityId}/sessoes`,
  convite: (codigo: string) => `/convite/${codigo.toUpperCase()}`,
  sortear: (communityId: string, sessionId: string) =>
    `/comunidades/${communityId}/sessoes/${sessionId}/sortear`,
  inscricao: (communityId: string, sessionId: string) =>
    `/comunidades/${communityId}/sessoes/${sessionId}/inscricao`,
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
  desempenho: (communityId: string) => `/comunidades/${communityId}/desempenho`,
  estatisticas: (communityId: string) => `/comunidades/${communityId}/desempenho/estatisticas`,
  historico: (communityId: string, options?: { sessao?: string }) => {
    const base = `/comunidades/${communityId}/desempenho/historico`;
    return options?.sessao ? `${base}?sessao=${encodeURIComponent(options.sessao)}` : base;
  },
  gestao: (communityId: string) => `/comunidades/${communityId}/gestao`,
  regras: (communityId: string) => `/comunidades/${communityId}/gestao/regras`,
  dados: (communityId: string) => `/comunidades/${communityId}/gestao/dados`,
  presenca: (communityId: string) => `/comunidades/${communityId}/sessoes/presenca`,
  listaWhatsapp: (communityId: string) => `/comunidades/${communityId}/sessoes/lista-whatsapp`,
  ligasComunidade: (communityId: string) => `/comunidades/${communityId}/ligas`,
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

export function resolveLegacyQueryRoute(pathname: string, search: string): RouteResolution {
  if (pathname === '/admin') return { kind: 'redirect', to: paths.plataforma };

  const segments = segmentsOf(pathname);
  const isDesempenho =
    segments[0] === 'comunidades' && !!segments[1] && segments[2] === 'desempenho' && !segments[3];
  if (!isDesempenho) return { kind: 'ok' };

  const query = new URLSearchParams(search);
  const sessao = query.get('sessao');
  if (sessao) return { kind: 'redirect', to: paths.historico(segments[1], { sessao }) };
  const aba = query.get('aba');
  if (aba === 'historico') return { kind: 'redirect', to: paths.historico(segments[1]) };
  if (aba === 'ranking') return { kind: 'redirect', to: paths.desempenho(segments[1]) };
  return { kind: 'ok' };
}

export function resolveCommunityAreaAccess(input: {
  area: string | null;
  hasRole: boolean;
  communityId: string;
}): RouteResolution {
  if (input.area === 'gestao' && !input.hasRole) {
    return { kind: 'redirect', to: paths.comunidade(input.communityId) };
  }
  return { kind: 'ok' };
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
      return communityId ? paths.historico(communityId) : paths.painel;
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
  if (segments[0] === 'comecar') return 'Montar a Pelada';
  if (segments[0] === 'pelada' && segments[1] === 'resumo') return 'Resumo da Pelada';
  if (segments[0] === 'agenda') return 'Agenda';
  if (segments[0] === 'ligas') {
    if (segments[1] === 'nova') return 'Nova Liga';
    if (segments[1]) return 'Detalhes da Liga';
    return 'Hub de Ligas';
  }
  if (segments[0] === 'perfil')
    return segments[1] === 'sync' ? 'Sincronização & Backup Nuvem' : 'Meu Perfil';
  if (segments[0] === 'plataforma') return 'Administração da plataforma';
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
      if (segments[3] === 'presenca') return 'Presença';
      if (segments[3] === 'lista-whatsapp') return 'Lista de WhatsApp';
      if (segments[4] === 'inscricao') return 'Inscrição';
      if (segments[4] === 'sortear') return 'Sortear os Times';
      return 'Detalhe da Sessão';
    case 'pessoas':
      return segments[3] === 'editar-atleta' ? 'Perfil do Atleta' : 'Pessoas';
    case 'ligas':
      return 'Ligas da Comunidade';
    case 'desempenho':
      if (segments[3] === 'historico') return 'Histórico';
      if (segments[3] === 'estatisticas') return 'Estatísticas';
      return 'Desempenho';
    case 'gestao':
      if (segments[3] === 'regras') return 'Regras da Comunidade';
      if (segments[3] === 'dados') return 'Dados da Comunidade';
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

export function getReturnRouteForPath(pathname: string): string | null {
  const segments = segmentsOf(pathname);
  if (segments.length <= 1) return null;

  if (segments[0] === 'ligas') {
    return paths.ligas;
  }

  if (segments[0] === 'perfil' && segments[1] === 'sync') {
    return paths.perfil;
  }

  if (segments[0] === 'comunidades') {
    const communityId = segments[1];
    if (segments.length === 2) {
      return paths.comunidades;
    }
    const area = segments[2];
    if (segments.length === 3) {
      return paths.comunidade(communityId);
    }
    if (area === 'pessoas' && segments[3] === 'editar-atleta') {
      return paths.pessoas(communityId);
    }
    if (area === 'sessoes') {
      return paths.sessoes(communityId);
    }
    return paths.comunidade(communityId);
  }

  return null;
}

export function getShellNavigationItems(input: {
  pathname: string;
  isStaff: boolean;
  pendingChanges: number;
  isGuest?: boolean;
}): ShellNavItem[] {
  const communityId = extractCommunityId(input.pathname);
  const path = input.pathname.split('?')[0];

  // No modo local o convidado so alcanca a pelada de hoje. Listar as areas de
  // conta aqui seria oferecer becos: todas param no muro de cadastro.
  if (input.isGuest) {
    return [
      {
        id: 'painel',
        label: 'Pelada de hoje',
        icon: 'dashboard',
        to: paths.painel,
        active: path === paths.painel || path === paths.comecar,
      },
    ];
  }

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
        id: 'comunidade-ligas',
        label: 'Ligas',
        icon: 'tournament',
        to: paths.ligasComunidade(communityId),
        active: area === 'ligas',
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
        label: 'Trocar comunidade',
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
      id: 'ligas',
      label: 'Ligas',
      icon: 'tournament',
      to: paths.ligas,
      active: path.startsWith('/ligas'),
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
      id: 'plataforma',
      label: 'Plataforma',
      icon: 'admin',
      to: paths.plataforma,
      active: path.startsWith(paths.plataforma),
    });
  }

  return items;
}
