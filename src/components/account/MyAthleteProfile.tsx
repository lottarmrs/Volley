import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import {
  draftFromPlayer,
  validateAthleteProfile,
  type AthleteProfileDraft,
} from '@domain/athleteProfile';
import type { Player } from '../../types';
import { AthleteProfileForm } from '../player/AthleteProfileForm';
import { AvatarUpload } from '../player/AvatarUpload';

export interface MyAthleteProfileProps {
  player: Player | null;
  onSaved: (draft: AthleteProfileDraft) => void;
  onAvatarApplied: (url: string) => void;
}

export const MyAthleteProfile: FC<MyAthleteProfileProps> = ({
  player,
  onSaved,
  onAvatarApplied,
}) => {
  const [draft, setDraft] = useState<AthleteProfileDraft | null>(
    player ? draftFromPlayer(player) : null,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (player) setDraft(draftFromPlayer(player));
  }, [player?.id]);

  return (
    <div className="card card-border bg-base-200">
      <div className="card-body gap-4">
        <h2 className="text-base font-black uppercase tracking-tight">Minha ficha</h2>
        {!player || !draft ? (
          <p className="text-sm text-base-content/60">Carregando sua ficha…</p>
        ) : (
          <>
            <AvatarUpload
              playerCloudId={player.cloudId}
              currentAvatarUrl={player.avatarUrl}
              initials={player.nome ? player.nome.substring(0, 2).toUpperCase() : 'AT'}
              onApplied={onAvatarApplied}
              disabled={salvando}
            />
            <AthleteProfileForm
              value={draft}
              onChange={setDraft}
              showCondition
              serverError={erro}
              disabled={salvando}
            />
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={salvando || Object.keys(validateAthleteProfile(draft)).length > 0}
                onClick={async () => {
                  setSalvando(true);
                  setErro(null);
                  const result = await updateMyAthleteProfile(draft);
                  setSalvando(false);
                  if (!result.ok) {
                    setErro(result.error.message);
                    return;
                  }
                  onSaved(draft);
                }}
              >
                Salvar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
