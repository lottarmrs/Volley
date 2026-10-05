import { supabase } from '../../lib/supabaseClient';
import type { LiveScoreState } from '@app/scoreQueue';
import { fetchProfilesByUserIds } from './membershipCloudService';

export type LiveScoreClient = typeof supabase;

export async function fetchLiveScoreState(
  sessionCloudId: string,
  client: LiveScoreClient = supabase,
): Promise<LiveScoreState> {
  const [sessao, pontos] = await Promise.all([
    client.from('sessions').select('controlled_by_user_id').eq('id', sessionCloudId).maybeSingle(),
    client
      .from('point_events')
      .select('id, local_id')
      .eq('session_id', sessionCloudId)
      .is('deleted_at', null),
  ]);
  if (sessao.error) throw sessao.error;
  if (pontos.error) throw pontos.error;
  const controlledByUserId =
    (sessao.data as { controlled_by_user_id: string | null } | null)?.controlled_by_user_id ?? null;
  const perfis = controlledByUserId
    ? await fetchProfilesByUserIds([controlledByUserId], client)
    : new Map();
  return {
    controlledByUserId,
    controllerName: controlledByUserId ? (perfis.get(controlledByUserId)?.name ?? null) : null,
    pointIds: ((pontos.data ?? []) as { id: string; local_id: string | null }[]).map(
      (row) => row.local_id || row.id,
    ),
  };
}
