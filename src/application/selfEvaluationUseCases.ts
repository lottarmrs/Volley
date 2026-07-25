import type { Attributes } from '../types';
import { selfEvaluationCloudService } from '@infra/supabase/selfEvaluationCloudService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface SelfEvaluationGateway {
  upsert: (playerId: string, attributes: Attributes) => Promise<void>;
}

export const supabaseSelfEvaluationGateway: SelfEvaluationGateway = {
  upsert: (playerId, attributes) => selfEvaluationCloudService.upsert(playerId, attributes),
};

export async function submitSelfEvaluation(
  playerId: string,
  attributes: Attributes,
  gateway: SelfEvaluationGateway = supabaseSelfEvaluationGateway,
): Promise<AppResult<void>> {
  const trimmedPlayerId = playerId.trim();
  if (!trimmedPlayerId) {
    return productError('invalid_input', 'Sincronize o atleta com a nuvem antes de avaliar.');
  }

  try {
    await gateway.upsert(trimmedPlayerId, attributes);
    return appOk(undefined);
  } catch (error) {
    return technicalError('Nao foi possivel salvar sua autoavaliacao.', error);
  }
}
