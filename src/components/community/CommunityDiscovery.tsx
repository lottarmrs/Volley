import { useEffect } from 'react';
import { Search, Loader2, Users, Check, X } from 'lucide-react';
import { useCommunityDiscovery } from '../../hooks/useCommunityDiscovery';
import type { PublicCommunityResult } from '../../application/communityMembershipUseCases';

interface CommunityDiscoveryProps {
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Você já é membro',
  pending: 'Pedido pendente',
  invited: 'Convidado',
  rejected: 'Pedido recusado',
};

/**
 * Descoberta de comunidades públicas: busca por nome e permite pedir entrada
 * (que fica pendente até aprovação). Componente standalone — pode ser aberto a
 * partir da lista de comunidades.
 */
export function CommunityDiscovery({ onClose }: CommunityDiscoveryProps) {
  const {
    query,
    setQuery,
    results,
    loading,
    error,
    actingId,
    search,
    requestJoin,
  } = useCommunityDiscovery();

  // Lista inicial das públicas ao abrir.
  useEffect(() => {
    search('');
  }, [search]);

  const handleRequest = async (community: PublicCommunityResult) => {
    await requestJoin(community);
  };

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" /> Descobrir comunidades
          </h3>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(query)}
            placeholder="Buscar por nome…"
            className="input input-bordered flex-1"
            autoFocus
          />
          <button
            type="button"
            onClick={() => search(query)}
            className="btn btn-outline"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>

        {error && <div className="alert alert-error text-sm">{error}</div>}

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {!loading && results.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              Nenhuma comunidade pública encontrada.
            </p>
          )}
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-base-200 border border-base-300"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                {c.description && (
                  <p className="text-xs text-text-muted truncate">{c.description}</p>
                )}
                <p className="text-xs text-text-muted flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {c.memberCount} membro(s)
                </p>
              </div>
              <div className="shrink-0">
                {c.myStatus ? (
                  <span className="badge badge-ghost text-xs gap-1">
                    {c.myStatus === 'active' && <Check className="w-3 h-3" />}
                    {STATUS_LABEL[c.myStatus] ?? c.myStatus}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequest(c)}
                    className="btn btn-primary btn-sm"
                    disabled={actingId === c.id}
                  >
                    {actingId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Pedir entrada'
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
