import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, ImageOff, RefreshCw } from 'lucide-react';
import { avatarStorageService } from '../../services/supabase/avatarStorageService';
import { PlayerAvatarProposal } from '../../types';

type QueueItem = PlayerAvatarProposal & { playerName: string };

/**
 * Approval inbox for the athlete CREATOR: pending photo proposals submitted by
 * other admins. Mount it wherever the creator manages their athletes
 * (e.g. a tab in the players area). Self-contained — fetches its own data.
 */
export function AvatarApprovalInbox() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await avatarStorageService.listMyApprovalQueue());
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as aprovações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    setError(null);
    try {
      await avatarStorageService[action](id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Ação não concluída.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-base-content/60">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/70">
          Fotos aguardando aprovação
        </h3>
        <button onClick={() => void load()} className="btn btn-ghost btn-xs gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {error && (
        <div className="alert alert-error py-2 text-xs font-bold">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="py-10 text-center card bg-base-200 border border-base-300 border-dashed">
          <p className="text-base-content/50 uppercase text-xs font-bold italic">
            Nenhuma foto pendente.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 card bg-base-200 border border-base-300 p-3"
              >
                <div className="avatar avatar-placeholder shrink-0">
                  <div className="w-12 rounded-full bg-base-300 overflow-hidden border border-base-300">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={`Proposta para ${item.playerName}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageOff className="w-5 h-5 text-base-content/40" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold uppercase text-sm truncate">{item.playerName}</p>
                  <p className="text-[10px] text-base-content/50 uppercase tracking-wider">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void act(item.id, 'approve')}
                    disabled={isBusy}
                    className="btn btn-success btn-sm btn-circle"
                    title="Aprovar"
                  >
                    {isBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => void act(item.id, 'reject')}
                    disabled={isBusy}
                    className="btn btn-outline btn-error btn-sm btn-circle"
                    title="Rejeitar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
