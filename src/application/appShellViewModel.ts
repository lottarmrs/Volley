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
