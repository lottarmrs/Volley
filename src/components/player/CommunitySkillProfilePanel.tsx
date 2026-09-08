import React, { useEffect, useId, useState } from 'react';
import type { CommunitySkillProfile } from '@shared/types';
import type { AppResult } from '@app/appResult';
import { loadCommunitySkillProfile } from '@app/communitySkillProfileUseCases';

interface Props {
  currentUserId: string | null;
  playerCloudId?: string;
  communities: Array<{ id: string; name: string }>;
  onOpenEvaluation?: (communityId: string) => void;
  onCommunityChange?: () => void;
  refreshVersion?: number;
}

const dimensionLabels: Record<string, string> = {
  saque: 'Saque',
  recepcao: 'Recepção',
  levantamento: 'Levantamento',
  ataque: 'Ataque',
  bloqueio: 'Bloqueio',
  defesa: 'Defesa',
  velocidade: 'Velocidade',
  resistencia: 'Resistência',
  leituraDeJogo: 'Leitura de jogo',
  regularidade: 'Regularidade',
  controleEmocional: 'Controle emocional',
};

const ProfileResult: React.FC<{ communityId: string; playerId: string }> = ({
  communityId,
  playerId,
}) => {
  const [result, setResult] = useState<AppResult<CommunitySkillProfile> | null>(null);
  useEffect(() => {
    let current = true;
    void loadCommunitySkillProfile({ communityId, playerId, rubricVersion: 'v0-legacy-11' }).then(
      (next) => {
        if (current) setResult(next);
      },
    );
    return () => {
      current = false;
    };
  }, [communityId, playerId]);

  if (!result)
    return (
      <p role="status" className="text-sm">
        Consultando perfil…
      </p>
    );
  if (!result.ok)
    return (
      <p role="alert" className="text-sm text-error">
        {result.error.message}
      </p>
    );
  const profile = result.value;
  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/75">
        {profile.contribution_count === 0
          ? 'Ainda não há avaliações neste modelo para este atleta e comunidade.'
          : `${profile.contribution_count} avaliações compõem este perfil.`}
      </p>
      <div className="overflow-x-auto">
        <table className="table table-sm text-sm">
          <caption className="sr-only">Perfil técnico experimental da comunidade</caption>
          <thead>
            <tr>
              <th>Fundamento</th>
              <th>Nota</th>
              <th>Notas utilizadas</th>
            </tr>
          </thead>
          <tbody>
            {profile.dimensions.map((dimension) => (
              <tr key={dimension.dimension_key}>
                <th scope="row" className="font-medium">
                  {dimensionLabels[dimension.dimension_key] ?? dimension.dimension_key}
                </th>
                <td className="tabular-nums">
                  {dimension.value === null
                    ? 'Sem avaliação'
                    : dimension.value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                </td>
                <td className="tabular-nums">
                  {dimension.included_count} de {dimension.sample_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-base-content/75">
        Notas utilizadas mostra quantas avaliações entraram na média após a filtragem. Dados
        consultados em {new Date(profile.calculated_at).toLocaleString('pt-BR')}.
      </p>
    </div>
  );
};

const PanelForPlayer: React.FC<{
  playerCloudId: string;
  communities: Props['communities'];
  onOpenEvaluation?: Props['onOpenEvaluation'];
  onCommunityChange?: Props['onCommunityChange'];
  refreshVersion?: number;
}> = ({ playerCloudId, communities, onOpenEvaluation, onCommunityChange, refreshVersion = 0 }) => {
  const selectId = useId();
  const titleId = useId();
  const [communityId, setCommunityId] = useState('');
  const [request, setRequest] = useState(0);
  const [seenRefresh, setSeenRefresh] = useState(refreshVersion);
  const selected = communities.some((community) => community.id === communityId);
  if (seenRefresh !== refreshVersion) {
    setSeenRefresh(refreshVersion);
    if (selected) setRequest((value) => value + 1);
  }
  if (communityId && !selected) {
    setCommunityId('');
    setRequest(0);
  }
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-base-300 bg-base-200 p-4 sm:p-6 space-y-4"
    >
      <div className="space-y-2">
        <h2 id={titleId} className="text-base font-semibold">
          Perfil experimental da comunidade
        </h2>
        <p className="text-sm text-base-content/75 max-w-3xl">
          Média por fundamento com filtragem de notas extremas. Mostra apenas avaliações do novo
          modelo; os critérios são experimentais e este perfil ainda não é usado no sorteio.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 max-w-lg space-y-1">
          <label htmlFor={selectId} className="text-sm font-medium">
            Comunidade do perfil
          </label>
          <select
            id={selectId}
            className="select select-bordered w-full"
            value={selected ? communityId : ''}
            onChange={(event) => {
              onCommunityChange?.();
              setCommunityId(event.target.value);
              setRequest(0);
            }}
          >
            <option value="">Selecione a comunidade</option>
            {communities.map((community) => (
              <option key={community.id} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!selected}
          onClick={() => setRequest((value) => value + 1)}
        >
          {request && selected ? 'Atualizar perfil' : 'Consultar perfil'}
        </button>
        {onOpenEvaluation && selected && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onOpenEvaluation(communityId)}
          >
            Avaliar atleta
          </button>
        )}
      </div>
      {request > 0 && selected && (
        <ProfileResult
          key={`${communityId}:${request}:${refreshVersion}`}
          communityId={communityId}
          playerId={playerCloudId}
        />
      )}
    </section>
  );
};

export function CommunitySkillProfilePanel({
  currentUserId,
  playerCloudId,
  communities,
  onOpenEvaluation,
  onCommunityChange,
  refreshVersion,
}: Props) {
  if (!currentUserId || !playerCloudId || communities.length === 0) return null;
  return (
    <PanelForPlayer
      key={`${currentUserId}:${playerCloudId}`}
      playerCloudId={playerCloudId}
      communities={communities}
      onOpenEvaluation={onOpenEvaluation}
      onCommunityChange={onCommunityChange}
      refreshVersion={refreshVersion}
    />
  );
}
