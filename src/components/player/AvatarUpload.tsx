import React, { useRef, useState } from 'react';
import { Camera, Loader2, Clock } from 'lucide-react';
import { avatarStorageService } from '../../services/supabase/avatarStorageService';

interface AvatarUploadProps {
  /** The athlete's CLOUD id (global identity). Required to attach a photo. */
  playerCloudId?: string;
  currentAvatarUrl?: string;
  /** Fallback initials shown when there is no photo. */
  initials: string;
  /** Called only when the change went live immediately (current user is the creator). */
  onApplied?: (newUrl: string) => void;
  /** Tailwind width class for the circle, e.g. "w-16". */
  sizeClass?: string;
  disabled?: boolean;
}

type Feedback = { kind: 'error' | 'pending' | 'applied'; message: string } | null;

export function AvatarUpload({
  playerCloudId,
  currentAvatarUrl,
  initials,
  onApplied,
  sizeClass = 'w-16',
  disabled,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setFeedback(null);
    setIsUploading(true);
    try {
      const result = await avatarStorageService.proposeAvatar(playerCloudId, file);
      if (result.applied) {
        onApplied?.(result.imageUrl);
        setFeedback({ kind: 'applied', message: 'Foto atualizada.' });
      } else {
        setFeedback({
          kind: 'pending',
          message: 'Enviada para aprovação do criador do atleta.',
        });
      }
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Falha ao enviar a foto.' });
    } finally {
      setIsUploading(false);
    }
  };

  const isDisabled = disabled || isUploading || !playerCloudId;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isDisabled}
        title={
          !playerCloudId
            ? 'Sincronize o atleta com a nuvem para adicionar uma foto'
            : 'Alterar foto de perfil'
        }
        className={`avatar avatar-placeholder relative group rounded-full ${
          isDisabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
        }`}
      >
        <div
          className={`${sizeClass} rounded-full bg-base-300 text-accent border-2 border-accent font-black overflow-hidden shadow-lg shadow-accent/15`}
        >
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt="Foto do atleta"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="flex items-center justify-center w-full h-full text-lg">
              {initials}
            </span>
          )}
        </div>

        {isUploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </span>
        )}

        {!isUploading && !isDisabled && (
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-3.5 h-3.5 text-white" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={isDisabled}
        className="hidden"
      />

      {feedback && (
        <p
          className={`text-[10px] font-bold uppercase tracking-wider text-center max-w-[10rem] flex items-center gap-1 ${
            feedback.kind === 'error'
              ? 'text-error'
              : feedback.kind === 'pending'
                ? 'text-warning'
                : 'text-success'
          }`}
        >
          {feedback.kind === 'pending' && <Clock className="w-3 h-3 shrink-0" />}
          {feedback.message}
        </p>
      )}
    </div>
  );
}
