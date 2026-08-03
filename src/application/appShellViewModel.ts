export type Page =
  | 'dashboard'
  | 'players'
  | 'player-edit'
  | 'session-wizard'
  | 'session-active'
  | 'history'
  | 'communities';

export type Module =
  | 'dashboard'
  | 'torneios'
  | 'players'
  | 'ranking'
  | 'historico'
  | 'configuracoes'
  | 'conta'
  | 'gestao';

export interface ModuleNavigationItem {
  id: Module;
  label: string;
  icon:
    'dashboard' | 'tournament' | 'players' | 'ranking' | 'history' | 'cloud' | 'settings' | 'admin';
  badge?: number;
}

export function getCurrentPageTitle(input: { page: Page; activeModule: Module }) {
  switch (input.activeModule) {
    case 'dashboard':
      return input.page === 'session-wizard' ? 'Configuração da Sessão' : 'Painel de Controle';
    case 'torneios':
      return 'Torneios & Campeonatos';
    case 'players':
      return input.page === 'player-edit'
        ? 'Perfil do Atleta'
        : input.page === 'communities'
          ? 'Grupos de Comunidade'
          : 'Cadastro de Atletas';
    case 'ranking':
      return 'Líderes & Classificações';
    case 'historico':
      return 'Histórico & Estatísticas';
    case 'configuracoes':
      return 'Configurações do Sistema';
    case 'conta':
      return 'Sincronização & Backup Nuvem';
    case 'gestao':
      return 'Gestão & Administração';
    default:
      return 'Panelinha';
  }
}

export function getAccountDisplay(input: {
  profileName?: string | null;
  email?: string | null;
  fallbackName: string;
  fallbackInitials: string;
}) {
  const name = input.profileName || input.email?.split('@')[0] || input.fallbackName;
  const initialsSource = input.profileName || input.email || input.fallbackInitials;
  return {
    name,
    initials: initialsSource.slice(0, 2).toUpperCase(),
  };
}

export function getModuleNavigationItems(input: {
  isStaff: boolean;
  pendingChanges: number;
}): ModuleNavigationItem[] {
  const items: ModuleNavigationItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'torneios', label: 'Torneios', icon: 'tournament' },
    { id: 'players', label: 'Jogadores', icon: 'players' },
    { id: 'ranking', label: 'Ranking', icon: 'ranking' },
    { id: 'historico', label: 'Histórico', icon: 'history' },
    {
      id: 'conta',
      label: 'Nuvem & Conta',
      icon: 'cloud',
      badge: input.pendingChanges,
    },
    { id: 'configuracoes', label: 'Configurações', icon: 'settings' },
  ];

  if (input.isStaff) {
    items.push({ id: 'gestao', label: 'Gestão', icon: 'admin' });
  }

  return items;
}

export function getModuleNavigationTarget(input: {
  module: Module;
  activeSessionStatus?: string | null;
}): { activeModule: Module; page?: Page } {
  if (input.module === 'dashboard') {
    return {
      activeModule: input.module,
      page: input.activeSessionStatus === 'active' ? 'session-active' : 'dashboard',
    };
  }
  if (input.module === 'players') {
    return { activeModule: input.module, page: 'players' };
  }
  return { activeModule: input.module };
}

export interface ShellNavigationTarget {
  activeModule: Module;
  page?: Page;
  selectedHistorySessionId?: string | null;
}

export function getDashboardNavigationTarget(): ShellNavigationTarget {
  return { activeModule: 'dashboard', page: 'dashboard' };
}

export function getPlayersNavigationTarget(): ShellNavigationTarget {
  return { activeModule: 'players', page: 'players' };
}

export function getCommunitiesNavigationTarget(): ShellNavigationTarget {
  return { activeModule: 'players', page: 'communities' };
}

export function getLiveSessionNavigationTarget(): ShellNavigationTarget {
  return { activeModule: 'dashboard', page: 'session-active' };
}

export function getHistoryNavigationTarget(): ShellNavigationTarget {
  return { activeModule: 'historico' };
}

export function getHistorySessionNavigationTarget(sessionId: string): ShellNavigationTarget {
  return { activeModule: 'historico', selectedHistorySessionId: sessionId };
}

import type { ConnectivityState } from '../logic/connectivity';

export interface PendingDeliveryNotice {
  visible: boolean;
  message: string;
}

/**
 * Aviso persistente de trabalho que nao chegou na nuvem.
 *
 * So aparece quando ha pendente E algo de fato impede a entrega (sem rede, ou falha
 * aberta). Pendente com rede e sem falha e apenas o sync que ainda nao rodou — avisar
 * ali treinaria a pessoa a ignorar o aviso.
 *
 * A palavra importa: "3 pendentes" descreve uma fila, "3 alteracoes ainda nao foram
 * para a nuvem" descreve uma perda possivel.
 */
export function buildPendingDeliveryNotice(input: {
  pendingChanges: number;
  connectivity: ConnectivityState;
  hasOpenFailure: boolean;
}): PendingDeliveryNotice | null {
  if (input.pendingChanges <= 0) return null;
  if (input.connectivity === 'online' && !input.hasOpenFailure) return null;

  const plural =
    input.pendingChanges === 1 ? 'alteração ainda não foi' : 'alterações ainda não foram';
  return {
    visible: true,
    message: `${input.pendingChanges} ${plural} para a nuvem.`,
  };
}
