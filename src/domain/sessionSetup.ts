import type { FreePlayConfig, Session, TournamentConfig } from '../types';

export type SessionValidationErrors = Record<string, string>;

export function hasPlayableRuleSnapshot(session: Session | null): boolean {
  return Boolean(session?.type && session.config?.type === session.type);
}

export function getFreePlaySetupConfig(session: Session): FreePlayConfig | null {
  if (session.type !== 'free_play' || session.config?.type !== 'free_play') {
    return null;
  }

  return session.config;
}

export function validateSessionWizardStep(
  session: Session | null,
  wizardStep: number,
): SessionValidationErrors {
  if (!session) {
    return {};
  }

  const errors: SessionValidationErrors = {};

  if (wizardStep === 0) {
    if (!session.name.trim()) errors.name = 'O nome da sessão é obrigatório.';
    if (!session.date) errors.date = 'A data é obrigatória.';
  } else if (wizardStep === 1) {
    if (session.selectedPlayerIds.length < 4) {
      errors.players = 'Selecione pelo menos 4 atletas.';
    }
  } else if (wizardStep === 3) {
    validateRulesStep(session, errors);
  }

  return errors;
}

function validateRulesStep(session: Session, errors: SessionValidationErrors) {
  const teamCount = session.config?.teamCount ?? 0;
  const requiredPlayers = teamCount * 3;

  if (!hasPlayableRuleSnapshot(session)) {
    errors.config = 'As regras da sessão precisam corresponder ao tipo da sessão.';
  }

  if (session.selectedPlayerIds.length < requiredPlayers) {
    errors.teamCount = `Para ${teamCount} times, selecione pelo menos ${requiredPlayers} jogadores.`;
  }

  if (session.type === 'free_play' && teamCount < 3) {
    errors.teamCount = 'Jogo livre exige pelo menos 3 times.';
  }

  if (session.type === 'tournament') {
    validateTournamentTeamCount(session.config, teamCount, errors);
  }
}

function validateTournamentTeamCount(
  config: Session['config'],
  teamCount: number,
  errors: SessionValidationErrors,
) {
  if (teamCount < 2) {
    errors.teamCount = 'Torneio exige pelo menos 2 times.';
  }

  if (config?.type !== 'tournament') {
    return;
  }

  const tournamentConfig = config as TournamentConfig;
  if (
    (tournamentConfig.format === 'groups_knockout' || tournamentConfig.format === 'group_stage') &&
    teamCount < 4
  ) {
    errors.teamCount = 'Fase de grupos exige pelo menos 4 times.';
  }
}
