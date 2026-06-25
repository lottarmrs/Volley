import { useState } from 'react';
import { KeyRound, Loader2, Users, Check, X } from 'lucide-react';
import { membershipCloudService } from '../../services/supabase/membershipCloudService';

interface JoinCommunityByCodeProps {
  onClose: () => void;
}

type Preview = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myStatus: string | null;
};

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Você já é membro desta comunidade.',
  pending: 'Seu pedido já está pendente de aprovação.',
  invited: 'Você foi convidado para esta comunidade.',
  rejected: 'Seu último pedido foi recusado. Você pode tentar de novo.',
};

/**
 * Entrar numa comunidade com um código de convite: faz o preview e envia o
 * pedido (que fica pendente até um dono/admin aprovar na Área de Membros).
 */
export function JoinCommunityByCode({ onClose }: JoinCommunityByCodeProps) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const handlePreview = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setRequested(false);
    try {
      const found = await membershipCloudService.findByCode(trimmed);
      if (!found) {
        setError('Código de convite inválido ou comunidade não encontrada.');
        return;
      }
      setPreview(found);
    } catch (e) {
      setError(messageOf(e, 'Não foi possível buscar a comunidade.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      await membershipCloudService.requestToJoin(code.trim());
      setRequested(true);
    } catch (e) {
      setError(messageOf(e, 'Não foi possível enviar o pedido.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> Entrar com código
          </h3>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            placeholder="CÓDIGO"
            className="input input-bordered flex-1 font-mono tracking-widest uppercase"
            disabled={loading || requested}
            autoFocus
          />
          <button
            type="button"
            onClick={handlePreview}
            className="btn btn-outline"
            disabled={loading || !code.trim() || requested}
          >
            {loading && !preview ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
          </button>
        </div>

        {error && <div className="alert alert-error text-sm">{error}</div>}

        {preview && !requested && (
          <div className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-2">
            <p className="font-semibold">{preview.name}</p>
            {preview.description && (
              <p className="text-xs text-text-muted">{preview.description}</p>
            )}
            <p className="text-xs text-text-muted flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {preview.memberCount} membro(s)
            </p>
            {preview.myStatus && STATUS_LABEL[preview.myStatus] && (
              <p className="text-xs text-warning">{STATUS_LABEL[preview.myStatus]}</p>
            )}
            {preview.myStatus !== 'active' && (
              <button
                type="button"
                onClick={handleRequest}
                className="btn btn-primary btn-sm w-full mt-1"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Pedir para entrar</>
                )}
              </button>
            )}
          </div>
        )}

        {requested && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-center space-y-1">
            <Check className="w-6 h-6 mx-auto text-success" />
            <p className="text-sm font-semibold">Pedido enviado!</p>
            <p className="text-xs text-text-muted">
              Um dono ou admin da comunidade precisa aprovar. Você verá a comunidade quando for
              aceito.
            </p>
            <button type="button" onClick={onClose} className="btn btn-sm btn-ghost mt-1">
              Fechar
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
