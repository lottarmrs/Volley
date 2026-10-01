import type { Community, Game, Session } from '@shared/types';
import type { SessionDraft } from '@logic/sessionDraft';
import { buildAgendaItems } from '@app/agendaViewModel';
import { paths } from '@app/appRoutes';
import type { ScreenContract } from '../screenContract';
import type { DashboardModel } from './dashboardModel';
import type { DashboardIntent } from './dashboardIntents';

export interface DashboardContractInput {
  activeSession: Session | null;
  sessionDraft: SessionDraft | null;
  games: Game[];
  onNewSession: () => void;
  onQuickPelada?: () => void;
  onResumeSession: () => void;
  onResumeDraft: (draft: SessionDraft) => void;
  onClearDraft: () => void;
  onClearActiveSession: () => void;
  onPlayers: () => void;
  onHistory: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onCommunities: () => void;
  sessions: Session[];
  communities: Community[];
  today: string;
  canStartSession?: boolean;
}

function formatarDia(iso: string): string {
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function proximaPelada(input: DashboardContractInput): DashboardModel['proximaPelada'] {
  const proxima = buildAgendaItems({
    today: input.today,
    communities: input.communities,
    sessions: input.sessions,
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  }).find((item) => item.kind === 'session');
  if (!proxima) return null;
  const sessao = input.sessions.find((item) => item.id === proxima.refId);
  const hora = sessao?.plannedStartAt
    ? new Date(sessao.plannedStartAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const partes = [formatarDia(proxima.date), hora, sessao?.location || null].filter(Boolean);
  return {
    to: paths.inscricao(proxima.communityId, proxima.refId),
    title: proxima.title,
    subtitle: partes.join(' · '),
  };
}

function buildModel(input: DashboardContractInput): DashboardModel {
  return {
    activeSession: input.activeSession,
    sessionDraft: input.sessionDraft,
    games: input.games,
    proximaPelada: proximaPelada(input),
    canStartSession: input.canStartSession ?? true,
  };
}

export function buildDashboardContract(
  input: DashboardContractInput,
): ScreenContract<DashboardModel, DashboardIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: DashboardIntent): Promise<void> => {
    switch (intent.kind) {
      case 'newSession':
        input.onNewSession();
        return;
      case 'quickPelada':
        input.onQuickPelada?.();
        return;
      case 'resumeSession':
        input.onResumeSession();
        return;
      case 'resumeDraft':
        input.onResumeDraft(intent.draft);
        return;
      case 'clearDraft':
        input.onClearDraft();
        return;
      case 'clearActiveSession':
        input.onClearActiveSession();
        return;
      case 'players':
        input.onPlayers();
        return;
      case 'history':
        input.onHistory();
        return;
      case 'exportBackup':
        input.onExportBackup();
        return;
      case 'importBackup':
        input.onImportBackup(intent.file);
        return;
      case 'communities':
        input.onCommunities();
        return;
    }
  };
  return { model, dispatch };
}
