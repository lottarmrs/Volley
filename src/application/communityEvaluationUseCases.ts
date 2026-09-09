import {
  COMMUNITY_EVALUATION_RUBRIC,
  type CommunityEvaluationCommand,
  type CommunityEvaluationEditorContext,
} from '@shared/types';
import type { Attributes } from '@shared/types';
import { supabase } from '@infra/supabase/communityEvaluationCloudService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface CommunityEvaluationGateway {
  loadEditor(communityId: string, playerId: string): Promise<CommunityEvaluationEditorContext>;
  record(command: CommunityEvaluationCommand): Promise<void>;
  activatedCommunityIds(communityIds: string[]): Promise<string[]>;
  activate(communityId: string): Promise<void>;
  setEvaluator(communityId: string, userId: string, enabled: boolean): Promise<void>;
}

const keys = new Set<string>([
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
]);

export function parseScores(
  values: Record<string, string>,
): AppResult<Partial<Record<keyof Attributes, number>>> {
  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!keys.has(key)) return productError('invalid_input', 'Há um fundamento inválido.');
    if (raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      return productError('invalid_input', 'As notas devem estar entre 0 e 10.');
    }
    parsed[key] = value;
  }
  return Object.keys(parsed).length
    ? appOk(parsed)
    : productError('invalid_input', 'Informe pelo menos uma nota.');
}

function classify(error: unknown): AppResult<never> {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '42501')
    return productError(
      'permission_denied',
      'Você não tem autorização para avaliar nesta comunidade.',
    );
  if (code === '40001')
    return productError('conflict', 'Esta avaliação mudou. Recarregue antes de enviar novamente.');
  if (code === '23514')
    return productError('invalid_input', 'A avaliação não atende aos critérios desta comunidade.');
  if (code === 'PGRST202' || code === '42883' || code === 'CLOUD_UNAVAILABLE')
    return productError(
      'cloud_unavailable',
      'A avaliação comunitária ainda não está disponível neste servidor.',
    );
  return technicalError('Não foi possível salvar a avaliação. Verifique a conexão.', error);
}

export async function loadCommunityEvaluationEditor(
  communityId: string,
  playerId: string,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<CommunityEvaluationEditorContext>> {
  if (!communityId.trim() || !playerId.trim())
    return productError('invalid_input', 'Sincronize a comunidade e o atleta antes de avaliar.');
  try {
    return appOk(await gateway.loadEditor(communityId.trim(), playerId.trim()));
  } catch (error) {
    return classify(error);
  }
}

export async function submitCommunityEvaluation(
  command: CommunityEvaluationCommand,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<void>> {
  if (
    !command.commandId.trim() ||
    !command.contributionId.trim() ||
    command.rubricVersion !== COMMUNITY_EVALUATION_RUBRIC ||
    Object.keys(command.dimensions).length === 0
  )
    return productError('invalid_input', 'Informe uma avaliação válida.');
  try {
    await gateway.record(command);
    return appOk(undefined);
  } catch (error) {
    return classify(error);
  }
}

export async function activateCommunityEvaluation(
  communityId: string,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<void>> {
  try {
    await gateway.activate(communityId.trim());
    return appOk(undefined);
  } catch (error) {
    return classify(error);
  }
}

export async function setCommunityEvaluator(
  communityId: string,
  userId: string,
  enabled: boolean,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<void>> {
  try {
    await gateway.setEvaluator(communityId.trim(), userId.trim(), enabled);
    return appOk(undefined);
  } catch (error) {
    return classify(error);
  }
}

/**
 * A comunidade ja migrou para o modelo versionado?
 *
 * Falha em `false`, de proposito. Quem decide de verdade e o banco: se a comunidade migrou
 * e o cliente nao souber, a escrita legada e recusada pelo gatilho. O erro oposto seria
 * grave -- tratar uma comunidade legada como migrada tira dela a unica superficie de
 * avaliacao que tem, e a unica saida seria um cutover irreversivel.
 */
export async function isCommunityEvaluationActivated(
  communityCloudId: string,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<boolean> {
  const id = communityCloudId?.trim();
  if (!id) return false;
  try {
    const activated = await gateway.activatedCommunityIds([id]);
    return Array.isArray(activated) && activated.some((value) => value?.trim() === id);
  } catch {
    return false;
  }
}
