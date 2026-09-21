import React, { useState } from 'react';
import { AlertTriangle, ClipboardCheck, Users } from 'lucide-react';
import type { Community, CommunityPresenceStatus, Player } from '../../../types';
import type { CommunityPresenceApi } from '@app/screens/communitiesView/communitiesViewModel';
import { getCommunityPlayers, getPlayerDisplayName } from '../../../logic/community';
import {
  formatPresenceText,
  getPresenceAlerts,
  getPresenceGroups,
  getPresenceStatus,
  getPresenceSummary,
} from '../../../logic/communityPresence';
import type { Position } from '../../../types';
import { ShareActions } from '../../share/ShareActions';
import { EmptyState } from '../../../ui/EmptyState';

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Libero',
  'all-rounder': 'Versatil',
};

export function CommunityPresenceArea({
  community,
  players,
  presenceApi,
  onCreateSession,
  canCreateSession = true,
}: {
  community: Community;
  players: Player[];
  presenceApi: CommunityPresenceApi;
  onCreateSession: () => void;
  canCreateSession?: boolean;
}) {
  const [guestName, setGuestName] = useState('');
  const presence = presenceApi.getPresence(community.id);
  const summary = getPresenceSummary(presence, players);
  const groups = getPresenceGroups(presence, players);
  const alerts = getPresenceAlerts(presence, players);
  const text = formatPresenceText(community.name, presence, players);

  // Presença é sobre quem do elenco vem hoje. Sem elenco, a lista de chamada é
  // uma folha em branco e as estatísticas viram zeros sem sentido.
  if (getCommunityPlayers(community.id, players).length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        size="compact"
        title="A chamada precisa de elenco"
        description="Aqui você marca quem confirmou para a pelada de hoje e quem furou. O sorteio usa essa lista para montar os times apenas com quem está em quadra — mas ela só existe depois que os atletas estiverem cadastrados na aba Atletas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-200">
        <div className="stat">
          <div className="stat-title">Presentes</div>
          <div className="stat-value">{summary.presentCount}</div>
          <div className="stat-desc">media {summary.averageOverall || 0}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Talvez</div>
          <div className="stat-value">{summary.maybeCount}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Ausentes</div>
          <div className="stat-value">{summary.absentCount}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Restricoes</div>
          <div className="stat-value">{summary.restrictedCount}</div>
          <div className="stat-desc">
            {summary.averageHeight ? `${summary.averageHeight}cm media` : 'altura sem dados'}
          </div>
        </div>
      </div>

      {alerts.map((alert) => (
        <div key={alert} role="alert" className="alert alert-warning alert-soft">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{alert}</span>
        </div>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => presenceApi.selectFrequentPlayers(community.id, players)}
          disabled={!canCreateSession}
        >
          Frequentes
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => presenceApi.useLastPresence(community.id)}
          disabled={!canCreateSession}
        >
          Ultima presenca
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => presenceApi.clearPresence(community.id)}
          disabled={!canCreateSession}
        >
          Limpar
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onCreateSession}
          disabled={!canCreateSession}
        >
          Criar sessão
        </button>
      </div>

      {canCreateSession && (
        <div className="join w-full">
          <input
            className="input input-bordered join-item flex-1"
            placeholder="Convidado temporario"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary join-item"
            onClick={() => {
              presenceApi.addGuest(community.id, guestName);
              setGuestName('');
            }}
          >
            Adicionar
          </button>
        </div>
      )}

      <ShareActions
        title={`Presenca - ${community.name}`}
        text={text}
        variant="menu"
        blocks={[
          { id: 'complete', label: 'Chamada completa', text },
          {
            id: 'present',
            label: 'Presentes',
            text: formatPresenceText(
              community.name,
              {
                communityId: community.id,
                date: '',
                updatedAt: '',
                items: groups.present.map((player) => ({ playerId: player.id, status: 'present' })),
              },
              players,
            ),
          },
          { id: 'alerts', label: 'Alertas', text: alerts.join('\n') || 'Sem alertas.' },
        ]}
      />

      <div className="list bg-base-200 rounded-box border border-base-300">
        {players.map((player) => (
          <div key={player.id} className="list-row">
            <div>
              <div className="font-bold">{getPlayerDisplayName(player)}</div>
              <div className="text-xs opacity-60">
                {player.posicaoPrincipal ? POSITION_LABELS[player.posicaoPrincipal] : '--'}
              </div>
            </div>
            <PresenceStatusControl
              status={getPresenceStatus(presence, player.id)}
              onChange={(status) => presenceApi.setPresenceStatus(community.id, player.id, status)}
              disabled={!canCreateSession}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PresenceStatusControl({
  status,
  onChange,
  disabled = false,
}: {
  status: CommunityPresenceStatus;
  onChange: (status: CommunityPresenceStatus) => void;
  disabled?: boolean;
}) {
  const items: Array<{ value: CommunityPresenceStatus; label: string }> = [
    { value: 'present', label: 'Presente' },
    { value: 'maybe', label: 'Talvez' },
    { value: 'absent', label: 'Ausente' },
    { value: 'unmarked', label: 'Limpar' },
  ];

  return (
    <div className="join">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`btn btn-xs join-item ${status === item.value ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onChange(item.value)}
          disabled={disabled}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
