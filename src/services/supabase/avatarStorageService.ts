import { supabase } from '../../lib/supabaseClient';
import { PlayerAvatarProposal } from '../../types';

const BUCKET = 'avatars';
const MAX_DIMENSION = 256; // px — avatars are shown small (selection grid, ranking)
const WEBP_QUALITY = 0.85;

export interface ProposeResult {
  proposalId: string;
  imageUrl: string;
  /** true when the current user is the athlete creator and the photo went live immediately. */
  applied: boolean;
}

/**
 * Downscale + re-encode an image File to a square-ish WebP Blob, entirely on the
 * client. This kills the "orphan file" problem (always one extension), shrinks
 * uploads/bandwidth for the ranking grid, and keeps the offline image cache light.
 * Falls back to the original file if the browser cannot encode WebP.
 */
async function toWebp(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      image.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file; // degrade gracefully; bucket also accepts jpeg/png
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('É necessário estar autenticado e online para alterar fotos.');
  return id;
}

function mapProposal(row: any): PlayerAvatarProposal {
  return {
    id: row.id,
    playerCloudId: row.player_id,
    proposedBy: row.proposed_by,
    imageUrl: row.image_url,
    status: row.status,
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
  };
}

export const avatarStorageService = {
  /**
   * Upload a candidate photo and register a proposal.
   *
   * Requires the athlete's CLOUD id (the global identity). Players that only
   * exist locally (never synced) cannot have a photo yet — surface that to the UI.
   */
  async proposeAvatar(playerCloudId: string | undefined, file: File): Promise<ProposeResult> {
    if (!supabase) throw new Error('Sincronização na nuvem indisponível.');
    if (!playerCloudId) {
      throw new Error('Sincronize o atleta com a nuvem antes de adicionar uma foto.');
    }

    await requireUserId();

    if (!file.type.startsWith('image/')) {
      throw new Error('Selecione um arquivo de imagem.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('A imagem é muito grande. O limite é 5MB.');
    }

    const blob = await toWebp(file);
    const ext = blob.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'jpg');
    // Unique filename per upload => unique public URL => no stale CDN/browser cache.
    const candidateId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `proposals/${playerCloudId}/${candidateId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const imageUrl = pub.publicUrl;

    const { data, error } = await supabase.rpc('propose_player_avatar', {
      p_player_id: playerCloudId,
      p_image_url: imageUrl,
    });
    if (error) throw error;

    // The RPC auto-approves (and promotes) when the caller is the athlete creator.
    const { data: proposalRow } = await supabase
      .from('player_avatar_proposals')
      .select('status')
      .eq('id', data)
      .single();

    return { proposalId: data, imageUrl, applied: proposalRow?.status === 'approved' };
  },

  /** Pending proposals for one athlete (visible to its admins/creator). */
  async listPendingForPlayer(playerCloudId: string): Promise<PlayerAvatarProposal[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('player_avatar_proposals')
      .select('*')
      .eq('player_id', playerCloudId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapProposal);
  },

  /**
   * The current user's approval inbox: pending proposals for athletes they created.
   * RLS already limits visibility to admins; we keep only the ones this user can
   * actually approve (athletes they own).
   */
  async listMyApprovalQueue(): Promise<Array<PlayerAvatarProposal & { playerName: string }>> {
    if (!supabase) return [];
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from('player_avatar_proposals')
      .select('*, players!inner(name, owner_id)')
      .eq('status', 'pending')
      .eq('players.owner_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      ...mapProposal(row),
      playerName: row.players?.name ?? '—',
    }));
  },

  async approve(proposalId: string): Promise<void> {
    if (!supabase) throw new Error('Sincronização na nuvem indisponível.');
    const { error } = await supabase.rpc('approve_player_avatar', { p_proposal_id: proposalId });
    if (error) throw error;
  },

  async reject(proposalId: string): Promise<void> {
    if (!supabase) throw new Error('Sincronização na nuvem indisponível.');
    const { error } = await supabase.rpc('reject_player_avatar', { p_proposal_id: proposalId });
    if (error) throw error;
  },
};
