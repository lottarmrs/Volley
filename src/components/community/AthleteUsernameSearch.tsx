import { FormEvent, useState } from 'react';
import { AtSign, Cloud, Search, UserPlus } from 'lucide-react';
import { Community } from '../../types';
import { playerCloudService } from '../../services/supabase/playerCloudService';
import { communityPlayerCloudService } from '../../services/supabase/communityPlayerCloudService';

interface AthleteUsernameSearchProps {
  community: Community;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
}

type Found = { cloudId: string; username: string; name: string };

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function AthleteUsernameSearch({
  community,
  currentUserId,
  isSupabaseConfigured,
}: AthleteUsernameSearchProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Found | null | undefined>(undefined);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured || !community.cloudId) {
    return (
      <div className="bg-base-200 rounded-xl border border-base-300 p-3 text-xs text-base-content/60 flex items-center gap-2">
        <Cloud className="w-4 h-4 shrink-0" />
        {!isSupabaseConfigured
          ? 'Conecte uma conta na nuvem para buscar atletas por @username.'
          : 'Sincronize esta comunidade com a nuvem para buscar atletas por @username.'}
      </div>
    );
  }

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const handle = query.trim().replace(/^@/, '');
    if (!handle) return;
    setSearching(true);
    setError(null);
    setResult(undefined);
    setLinked(false);
    try {
      setResult(await playerCloudService.findByUsername(handle));
    } catch (e) {
      setError(messageOf(e, 'Não foi possível buscar o atleta.'));
    } finally {
      setSearching(false);
    }
  };

  const handleLink = async () => {
    if (!result || !community.cloudId || !currentUserId) return;
    setLinking(true);
    setError(null);
    try {
      await communityPlayerCloudService.linkPlayer(
        community.cloudId,
        result.cloudId,
        currentUserId,
      );
      setLinked(true);
    } catch (e) {
      setError(messageOf(e, 'Não foi possível vincular o atleta.'));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-3 space-y-3">
      <p className="text-xs font-semibold flex items-center gap-2">
        <AtSign className="w-4 h-4" /> Adicionar atleta existente por @username
      </p>

      <form onSubmit={handleSearch} className="join w-full">
        <input
          className="input input-bordered join-item flex-1"
          placeholder="@username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={searching}
        />
        <button
          type="submit"
          className="btn btn-outline join-item"
          disabled={searching || !query.trim()}
        >
          <Search className="w-4 h-4" />
        </button>
      </form>

      {error && (
        <div className="alert alert-error alert-soft text-xs" role="alert">
          <span>{error}</span>
        </div>
      )}

      {result === null && !error && (
        <p className="text-xs text-base-content/60">Nenhum atleta encontrado com esse @username.</p>
      )}

      {result && (
        <div className="flex items-center justify-between gap-3 bg-base-100 rounded-lg border border-base-300 p-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{result.name}</p>
            <p className="text-xs text-base-content/60 truncate">@{result.username}</p>
          </div>
          {linked ? (
            <span className="badge badge-success badge-soft shrink-0">Vinculado</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm shrink-0"
              onClick={handleLink}
              disabled={linking}
            >
              <UserPlus className="w-4 h-4" /> Adicionar
            </button>
          )}
        </div>
      )}

      {linked && (
        <p className="text-xs text-base-content/60">
          Atleta vinculado à comunidade. Use <strong>Baixar da nuvem</strong> para trazê-lo ao app.
        </p>
      )}
    </div>
  );
}
