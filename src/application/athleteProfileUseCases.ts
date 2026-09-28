import { validateAthleteProfile, type AthleteProfileDraft } from '@domain/athleteProfile';
import { athleteProfileCloudService } from '@infra/supabase/athleteProfileCloudService';
import type { Player } from '@shared/types';
import type { AccountReadiness } from './accountUseCases';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface AthleteProfileGateway {
  update(draft: AthleteProfileDraft): Promise<AccountReadiness>;
}

const MENSAGENS: Array<[RegExp, string]> = [
  [/gender/i, 'Escolha o gênero.'],
  [/primary position/i, 'Escolha uma posição principal válida.'],
  [/height/i, 'A altura precisa estar entre 120 e 230 cm.'],
  [/dominant hand/i, 'Escolha a mão dominante.'],
  [/secondary/i, 'As posições secundárias não podem repetir a principal.'],
];

export async function updateMyAthleteProfile(
  draft: AthleteProfileDraft,
  gateway: AthleteProfileGateway = athleteProfileCloudService,
): Promise<AppResult<AccountReadiness>> {
  const errors = validateAthleteProfile(draft);
  const primeiro = Object.values(errors)[0];
  if (primeiro) return productError('invalid_input', primeiro);
  try {
    return appOk(await gateway.update(draft));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message =
      error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (code === '23514') {
      const achado = MENSAGENS.find(([padrao]) => padrao.test(message));
      return productError('invalid_input', achado ? achado[1] : 'Confira os dados da ficha.');
    }
    if (code === 'CLOUD_UNAVAILABLE')
      return productError('cloud_unavailable', 'Precisamos de conexão para salvar sua ficha.');
    return technicalError('Não foi possível salvar sua ficha. Verifique a conexão.', error);
  }
}

export function applyAthleteDraftToPlayer(player: Player, draft: AthleteProfileDraft): Player {
  return {
    ...player,
    genero: draft.genero,
    posicaoPrincipal: draft.posicaoPrincipal,
    posicoesSecundarias: draft.posicoesSecundarias,
    alturaCm: draft.alturaCm ?? undefined,
    maoDominante: draft.maoDominante ?? player.maoDominante,
    apelido: draft.apelido.trim(),
    status: {
      ...player.status,
      lesionado: draft.lesionado ?? false,
      limitacaoFisica: draft.limitacaoFisica ?? null,
    },
    syncStatus: 'synced',
  };
}

export function applyAthleteDraftToOwnPlayer(
  players: Player[],
  userId: string,
  draft: AthleteProfileDraft,
): Player[] {
  return players.map((player) =>
    player.userId === userId && !player.deletedAt
      ? applyAthleteDraftToPlayer(player, draft)
      : player,
  );
}
