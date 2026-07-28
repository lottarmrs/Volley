// src/infra/outbox/outboxClient.ts
import { createHash } from 'node:crypto';
import { supabase } from '../../lib/supabaseClient';

export type OutboxStatus = 'pending_upload' | 'syncing' | 'cloud_confirmed' | 'recoverable_error';

export interface OutboxEntry {
  id: string;
  authUserId: string;
  communityId?: string | null;
  operation: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_ATTEMPTS = 5;

export function computeIdempotencyKey(
  operation: string,
  payload: Record<string, unknown>,
  userId: string,
): string {
  const canonical = JSON.stringify({ operation, payload, userId });
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateOutboxPayload(
  operation: string,
  payload: Record<string, unknown>,
): { ok: boolean; message?: string } {
  const known: Record<string, (p: Record<string, unknown>) => boolean> = {
    'session.conclude': (p) => typeof p.sessionId === 'string' && p.sessionId.length > 0,
    'point.register': (p) => typeof p.sessionId === 'string' && p.sessionId.length > 0,
    'claim.apply': (p) => typeof p.playerId === 'string' && p.playerId.length > 0,
    'evaluation.save': (p) => typeof p.playerId === 'string' && typeof p.communityId === 'string',
  };
  const validator = known[operation];
  if (!validator) return { ok: false, message: `unknown operation: ${operation}` };
  return validator(payload) ? { ok: true } : { ok: false, message: `invalid payload for ${operation}` };
}

type Transition = 'markSyncing' | 'markConfirmed' | 'markRecoverableError' | 'markRetryReady';

export function pendingOutboxTransition(
  entry: OutboxEntry,
  transition: Transition,
  errorMessage?: string,
): OutboxEntry {
  const now = new Date().toISOString();
  switch (transition) {
    case 'markSyncing':
      return entry.status === 'pending_upload'
        ? { ...entry, status: 'syncing', updatedAt: now }
        : entry;
    case 'markConfirmed':
      return { ...entry, status: 'cloud_confirmed', updatedAt: now, lastError: null };
    case 'markRecoverableError':
      return {
        ...entry,
        status: 'recoverable_error',
        attempts: entry.attempts + 1,
        lastError: errorMessage ?? null,
        updatedAt: now,
      };
    case 'markRetryReady':
      if (entry.status !== 'recoverable_error' || entry.attempts >= MAX_ATTEMPTS) return entry;
      return { ...entry, status: 'pending_upload', updatedAt: now };
  }
}

export const outboxClient = {
  async enqueue(
    operation: string,
    payload: Record<string, unknown>,
    authUserId: string,
    communityId?: string,
  ): Promise<OutboxEntry> {
    const validation = validateOutboxPayload(operation, payload);
    if (!validation.ok) throw new Error(`outbox: ${validation.message}`);
    const idempotencyKey = computeIdempotencyKey(operation, payload, authUserId);
    const { data, error } = await supabase
      .from('outbox_entries')
      .upsert(
        {
          auth_user_id: authUserId,
          community_id: communityId ?? null,
          operation,
          payload,
          idempotency_key: idempotencyKey,
          status: 'pending_upload',
          attempts: 0,
        },
        { onConflict: 'idempotency_key' },
      )
      .select()
      .single();
    if (error) throw error;
    return data as unknown as OutboxEntry;
  },

  async pendingForUser(userId: string): Promise<OutboxEntry[]> {
    const { data, error } = await supabase
      .from('outbox_entries')
      .select('*')
      .eq('auth_user_id', userId)
      .in('status', ['pending_upload', 'syncing'])
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as OutboxEntry[];
  },

  async transition(id: string, transition: Transition, errorMessage?: string): Promise<void> {
    const { error } = await supabase
      .from('outbox_entries')
      .update(pendingOutboxTransition({} as OutboxEntry, transition, errorMessage))
      .eq('id', id);
    if (error) throw error;
  },

  async clearConfirmed(userId: string): Promise<void> {
    await supabase
      .from('outbox_entries')
      .delete()
      .eq('auth_user_id', userId)
      .eq('status', 'cloud_confirmed');
  },
};
