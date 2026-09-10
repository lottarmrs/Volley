import React, { useState } from 'react';
import { Player, Session } from '../../types';
import { Users, Calendar, MapPin, Trophy, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import {
  executeSessionCohortTransition,
  inspectLegacySessionCutover,
  isTargetCohortSession,
  transitionLegacySessionCommand,
  type SessionCutoverInspection,
  type TargetSessionPlayMode,
  type TransitionLegacySessionPayload,
} from '@app/sessionCohortCutover';
import { rejection, type CommandResult } from '@app/command/commandOutcome';
import type { CommandEnvelope } from '@app/command/commandEnvelope';
import type { CommandPort } from '@app/command/commandPort';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { createSupabaseCommandGateway } from '@infra/supabase/commandGateway';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '@storage/localStorageRepository';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

const sessionCohortCommandPort: CommandPort = isSupabaseConfigured
  ? createSupabaseCommandGateway(supabase)
  : {
      async execute(_operation, context) {
        return rejection(
          'OFFLINE_UNAVAILABLE',
          'Supabase não está configurado.',
          context.envelope.commandId,
        );
      },
    };

const BLOCKER_MESSAGES: Record<string, string> = {
  HAS_GAME_EVIDENCE: 'Esta Sessão já tem jogos registrados.',
  HAS_TARGET_ARTIFACTS: 'Esta Sessão já tem dados do novo sistema vinculados a ela.',
  HAS_TEAM_EVIDENCE: 'Esta Sessão já tem times formados.',
  NOT_DRAFT: 'Esta Sessão não está mais em rascunho.',
  NOT_LEGACY: 'Esta Sessão já não pertence mais ao sistema legado.',
  ROSTER_PLAYERS_COLLIDE: 'Há atletas duplicados na lista de convocados desta Sessão.',
  ROSTER_TOKEN_AMBIGUOUS: 'Um dos convocados desta Sessão não pôde ser identificado com segurança.',
  ROSTER_TOKEN_REPEATED: 'Um dos convocados desta Sessão aparece mais de uma vez na lista.',
  ROSTER_TOKEN_UNRESOLVED: 'Um dos convocados desta Sessão não foi encontrado no cadastro.',
  SOFT_DELETED: 'Esta Sessão foi excluída.',
};

function describeBlocker(code: string): string {
  return (
    BLOCKER_MESSAGES[code] ??
    `Bloqueio não reconhecido (${code}). Não é possível converter esta Sessão agora.`
  );
}

function resolvePlayMode(session: Session): TargetSessionPlayMode {
  return session.type === 'tournament' ? 'STRUCTURED_MATCHES' : 'FREE_PLAY';
}

function persistSessionAsTargetCohort(session: Session): Session {
  const updated: Session = {
    ...session,
    authorityModel: 'target',
    updatedAt: new Date().toISOString(),
  };

  const sessions = loadFromStorage<Session[]>(STORAGE_KEYS.sessions, []);
  const nextSessions = sessions.some((s) => s.id === updated.id)
    ? sessions.map((s) => (s.id === updated.id ? updated : s))
    : [...sessions, updated];
  saveToStorage(STORAGE_KEYS.sessions, nextSessions);

  const active = loadFromStorage<Session | null>(STORAGE_KEYS.activeSession, null);
  if (active && active.id === updated.id) {
    saveToStorage(STORAGE_KEYS.activeSession, updated);
  }

  return updated;
}

type CutoverPhase =
  | 'closed'
  | 'inspecting'
  | 'blocked'
  | 'confirm'
  | 'converting'
  | 'success'
  | 'failed';

interface SessionSetupSummaryProps {
  session: Session;
  selectedPlayers: Player[];
}

export function SessionSetupSummary({ session, selectedPlayers }: SessionSetupSummaryProps) {
  const males = selectedPlayers.filter((p) => p.genero === 'M').length;
  const females = selectedPlayers.filter((p) => p.genero === 'F').length;

  const [phase, setPhase] = useState<CutoverPhase>('closed');
  const [inspection, setInspection] = useState<SessionCutoverInspection | null>(null);
  const [command, setCommand] = useState<CommandEnvelope<TransitionLegacySessionPayload> | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [convertedSession, setConvertedSession] = useState<Session | null>(null);
  const [failedStep, setFailedStep] = useState<'inspect' | 'confirm' | null>(null);

  const effectiveSession = convertedSession ?? session;
  // A elegibilidade inicial olha para a Session original: uma vez que a conversao
  // comeca, o painel (inclusive a mensagem de sucesso) continua visivel mesmo depois
  // que `effectiveSession` passa a carregar `authorityModel: 'target'`.
  const canOfferConversionInitially = !!session.communityId && !isTargetCohortSession(session);
  const canOfferConversion = canOfferConversionInitially || phase !== 'closed';

  const startInspection = async () => {
    setPhase('inspecting');
    setErrorMessage(null);
    setInspection(null);
    try {
      const result = await inspectLegacySessionCutover(
        sessionCohortCloudService,
        effectiveSession.cloudId as string,
      );
      setInspection(result);
      setPhase(result.eligible ? 'confirm' : 'blocked');
    } catch {
      setErrorMessage('Não foi possível verificar se esta Sessão pode ser convertida agora.');
      setFailedStep('inspect');
      setPhase('failed');
    }
  };

  const confirmConversion = async () => {
    if (!inspection) return;
    setPhase('converting');
    setErrorMessage(null);

    const envelope =
      command ??
      transitionLegacySessionCommand(
        effectiveSession.cloudId as string,
        inspection.sourceFingerprint,
        'COMMUNITY',
        resolvePlayMode(effectiveSession),
      );
    setCommand(envelope);

    const result: CommandResult<void> = await executeSessionCohortTransition(
      sessionCohortCommandPort,
      envelope,
    );

    if (result.outcome === 'ACCEPTED') {
      const updated = persistSessionAsTargetCohort(effectiveSession);
      setConvertedSession(updated);
      setPhase('success');
    } else {
      setErrorMessage(result.message);
      setFailedStep('confirm');
      setPhase('failed');
    }
  };

  const retryFailedStep = () => {
    if (failedStep === 'inspect') startInspection();
    else confirmConversion();
  };

  const cancelConversion = () => {
    setPhase('closed');
    setInspection(null);
    setErrorMessage(null);
    setCommand(null);
    setFailedStep(null);
  };

  return (
    <div className="card card-border bg-base-200 h-fit lg:sticky lg:top-8">
      <div className="card-body p-6 space-y-4">
        <h3 className="card-title text-xs font-bold uppercase tracking-[0.2em] text-accent border-b border-base-300 pb-4">
          Resumo da Sessão
        </h3>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 bg-base-100 rounded">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">
                Nome & Data
              </p>
              <p className="text-xs font-bold text-base-content uppercase">
                {session.name || '---'}
              </p>
              <p className="text-[10px] text-text-muted font-mono">{session.date || '---'}</p>
            </div>
          </div>

          {session.location && (
            <div className="flex items-start gap-3">
              <div className="mt-1 p-1 bg-base-100 rounded">
                <MapPin className="w-3.5 h-3.5 text-text-muted" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">
                  Local
                </p>
                <p className="text-xs font-bold text-base-content uppercase">{session.location}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 bg-base-100 rounded">
              <Users className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">
                Atletas Selecionados
              </p>
              <p className="text-sm font-bold text-base-content">{selectedPlayers.length}</p>
              <p className="text-[9px] font-bold text-base-content/60 uppercase">
                <span className="text-info">{males}M</span> /{' '}
                <span className="text-secondary">{females}F</span>
              </p>
            </div>
          </div>

          {session.type && (
            <div className="flex items-start gap-3 border-t border-base-300 pt-4">
              <div className="mt-1 p-1 bg-base-100 rounded">
                {session.type === 'free_play' ? (
                  <Clock className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted leading-none mb-1">
                  Formato
                </p>
                <p className="text-xs font-bold text-base-content uppercase">
                  {session.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
                </p>
                {session.config && (
                  <p className="text-[9px] font-bold text-text-muted uppercase mt-1">
                    {session.config.teamCount} Times • {session.config.maxPoints} Pts •{' '}
                    {session.config.tieBreakMethod === 'direct_3' ? '3 Direto' : 'Vai a 2'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedPlayers.length > 0 && session.config && (
          <div className="mt-6 pt-4 border-t border-base-300">
            <div className="flex justify-between items-center bg-base-100 p-3 rounded-lg border border-base-300">
              <div>
                <p className="text-[8px] font-bold text-text-muted uppercase">Atletas / Time</p>
                <p className="text-xs font-bold font-mono text-base-content">
                  ~{(selectedPlayers.length / session.config.teamCount).toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold text-text-muted uppercase">Equilíbrio</p>
                <p className="text-xs font-bold font-mono text-success">Estimado</p>
              </div>
            </div>
          </div>
        )}

        {canOfferConversion && (
          <div className="mt-6 pt-4 border-t border-base-300 space-y-3">
            {phase === 'closed' && (
              <>
                {effectiveSession.cloudId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline w-full"
                    onClick={startInspection}
                  >
                    Converter para o novo sistema
                  </button>
                ) : (
                  <p className="text-[10px] text-text-muted">
                    Sincronize esta Sessão com a nuvem para poder convertê-la para o novo sistema.
                  </p>
                )}
              </>
            )}

            {phase === 'inspecting' && (
              <p className="flex items-center gap-2 text-[10px] text-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Verificando elegibilidade...
              </p>
            )}

            {phase === 'blocked' && inspection && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-bold text-warning">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Esta Sessão não pode ser convertida agora
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {inspection.blockers.map((blocker) => (
                    <li key={blocker} className="text-[10px] text-text-muted">
                      {describeBlocker(blocker)}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-xs btn-ghost" onClick={cancelConversion}>
                  Fechar
                </button>
              </div>
            )}

            {phase === 'confirm' && inspection && (
              <div className="space-y-2">
                <p className="flex items-start gap-2 text-[10px] text-warning font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Essa conversão não tem volta: depois de concluída, esta Sessão não pode retornar
                  ao sistema antigo.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline flex-1"
                    onClick={cancelConversion}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-warning flex-1"
                    onClick={confirmConversion}
                  >
                    Confirmar conversão
                  </button>
                </div>
              </div>
            )}

            {phase === 'converting' && (
              <p className="flex items-center gap-2 text-[10px] text-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Convertendo Sessão...
              </p>
            )}

            {phase === 'success' && (
              <p className="text-[10px] font-bold text-success">
                Sessão convertida para o novo sistema.
              </p>
            )}

            {phase === 'failed' && (
              <div className="space-y-2">
                <p className="text-[10px] text-error">
                  Não foi possível converter a Sessão: {errorMessage}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost flex-1"
                    onClick={cancelConversion}
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline flex-1"
                    onClick={retryFailedStep}
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
