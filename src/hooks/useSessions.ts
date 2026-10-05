import {
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type SetStateAction,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Community,
  Session,
  Team,
  Game,
  PointEvent,
  GameReport,
  SessionReport,
  TournamentConfig,
} from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { normalizeGames, normalizeSession, normalizeSessions } from '../logic/migrations';
import { propagateKnockoutResults } from '../logic/tournament';
import {
  buildSessionDeletionResult,
  removeOrphanedSessionData,
} from '../application/sessionLifecycleUseCases';
import { fetchMyCommunities } from '../application/communityDataQueries';
import {
  emptySessionBundle,
  fetchMySessions,
  type SessionBundle,
} from '../application/sessionDataQueries';
import {
  defaultSessionWriteGateway,
  persistSessionBundleChanges,
} from '../application/sessionWrites';
import { queryKeys } from '../application/queryKeys';
import { createInvalidationBatcher } from '../application/invalidationBatcher';
import { readAfterWrites } from '../application/readAfterWrites';
import { OFFLINE_MESSAGE, toOnlineError } from '../application/onlineErrors';
import { offlineError, type AppError } from '../application/appResult';
import { ToastContext } from '../ui/common/useToast';
import { useOnlineAccount, type OnlineStatus } from './useOnlineList';

type BundleField = keyof SessionBundle;

function resolve<T>(value: SetStateAction<T>, prev: T): T {
  return typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
}

export function useSessions() {
  const { online, userId, settled } = useOnlineAccount();
  const queryClient = useQueryClient();
  const toasts = useContext(ToastContext);
  const key = useMemo(() => queryKeys.peladas(userId ?? ''), [userId]);

  const [sessions, setLocalSessions] = useState<Session[]>(() =>
    normalizeSessions(loadFromStorage(STORAGE_KEYS.sessions, [])),
  );
  const [localActiveSession, setLocalActiveSession] = useState<Session | null>(() => {
    const loaded = loadFromStorage<Session | null>(STORAGE_KEYS.activeSession, null);
    return loaded ? normalizeSession(loaded) : null;
  });
  const [teams, setLocalTeams] = useState<Team[]>(() => loadFromStorage(STORAGE_KEYS.teams, []));
  const [games, setLocalGames] = useState<Game[]>(() =>
    normalizeGames(loadFromStorage(STORAGE_KEYS.games, [])),
  );
  const [pointEvents, setLocalPointEvents] = useState<PointEvent[]>(() =>
    loadFromStorage(STORAGE_KEYS.points, []),
  );
  const [gameReports, setLocalGameReports] = useState<GameReport[]>(() =>
    loadFromStorage(STORAGE_KEYS.gameReports, []),
  );
  const [sessionReports, setLocalSessionReports] = useState<SessionReport[]>(() =>
    loadFromStorage(STORAGE_KEYS.sessionReports, []),
  );

  const local = settled && !online;
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.sessions, sessions);
  }, [sessions, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.activeSession, localActiveSession);
  }, [localActiveSession, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.teams, teams);
  }, [teams, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.games, games);
  }, [games, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.points, pointEvents);
  }, [pointEvents, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.gameReports, gameReports);
  }, [gameReports, local]);
  useEffect(() => {
    if (local) saveToStorage(STORAGE_KEYS.sessionReports, sessionReports);
  }, [sessionReports, local]);

  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const writeVersion = useRef(0);
  const query = useQuery({
    queryKey: key,
    enabled: online,
    queryFn: async () => {
      const communities = await queryClient.ensureQueryData<Community[]>({
        queryKey: queryKeys.comunidades(userId ?? ''),
        queryFn: fetchMyCommunities,
      });
      return readAfterWrites({
        fetch: () => fetchMySessions(communities),
        settled: () => writeChain.current,
        version: () => writeVersion.current,
      });
    },
  });
  const remote = query.data ?? emptySessionBundle();

  const [writeError, setWriteError] = useState<AppError | null>(null);
  const conferir = useRef(
    createInvalidationBatcher(
      (keys) => {
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      },
      { delayMs: 800, maxWaitMs: 3000 },
    ),
  );
  useEffect(() => {
    const lote = conferir.current;
    return () => lote.cancel();
  }, []);

  const report = useCallback(
    (error: AppError) => {
      setWriteError(error);
      toasts?.push(error.message, 'error');
    },
    [toasts],
  );

  const communityCloudId = useCallback(
    (appId: string | null | undefined) => {
      if (!appId) return null;
      const communities =
        queryClient.getQueryData<Community[]>(queryKeys.comunidades(userId ?? '')) ?? [];
      return communities.find((community) => community.id === appId)?.cloudId ?? null;
    },
    [queryClient, userId],
  );

  const writeField = useCallback(
    <K extends BundleField>(field: K, value: SetStateAction<SessionBundle[K]>) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        report(offlineError(OFFLINE_MESSAGE).error);
        return;
      }
      const prev = queryClient.getQueryData<SessionBundle>(key) ?? emptySessionBundle();
      const nextField = resolve(value, prev[field]);
      if (nextField === prev[field]) return;
      const next = { ...prev, [field]: nextField } as SessionBundle;
      writeVersion.current += 1;
      void queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, next);
      writeChain.current = writeChain.current
        .then(() =>
          persistSessionBundleChanges(
            prev,
            next,
            { userId: userId ?? '', communityCloudId },
            defaultSessionWriteGateway,
          ),
        )
        .then(() => {
          setWriteError(null);
          conferir.current.add([key]);
        })
        .catch((error) => {
          report(toOnlineError(error));
          void queryClient.invalidateQueries({ queryKey: key });
        });
    },
    [communityCloudId, key, queryClient, report, userId],
  );

  const setSessions = useCallback(
    (value: SetStateAction<Session[]>) =>
      online ? writeField('sessions', value) : setLocalSessions(value),
    [online, writeField],
  );
  const setTeams = useCallback(
    (value: SetStateAction<Team[]>) => (online ? writeField('teams', value) : setLocalTeams(value)),
    [online, writeField],
  );
  const setGames = useCallback(
    (value: SetStateAction<Game[]>) => (online ? writeField('games', value) : setLocalGames(value)),
    [online, writeField],
  );
  const setPointEvents = useCallback(
    (value: SetStateAction<PointEvent[]>) =>
      online ? writeField('pointEvents', value) : setLocalPointEvents(value),
    [online, writeField],
  );
  const setGameReports = useCallback(
    (value: SetStateAction<GameReport[]>) =>
      online ? writeField('gameReports', value) : setLocalGameReports(value),
    [online, writeField],
  );
  const setSessionReports = useCallback(
    (value: SetStateAction<SessionReport[]>) =>
      online ? writeField('sessionReports', value) : setLocalSessionReports(value),
    [online, writeField],
  );

  const currentSessions = online ? remote.sessions : sessions;
  const currentTeams = online ? remote.teams : teams;
  const currentGames = online ? remote.games : games;
  const currentPointEvents = online ? remote.pointEvents : pointEvents;
  const currentGameReports = online ? remote.gameReports : gameReports;
  const livePointEvents = useMemo(
    () => currentPointEvents.filter((point) => !point.deletedAt),
    [currentPointEvents],
  );
  const currentSessionReports = online ? remote.sessionReports : sessionReports;

  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const [draftActive, setDraftActive] = useState<Session | null>(null);
  const adopted = useMemo(() => {
    const live = currentSessions.filter((session) => session.status === 'active');
    return (
      live.find((session) => session.controlledByUserId === userId) ??
      live.find((session) => session.cloudOwnerId === userId) ??
      null
    );
  }, [currentSessions, userId]);
  const onlineActive =
    activeId === undefined
      ? adopted
      : activeId === null
        ? null
        : (currentSessions.find((session) => session.id === activeId) ??
          (draftActive?.id === activeId ? draftActive : null));
  const activeSession = online ? onlineActive : localActiveSession;

  const setActiveSession = useCallback(
    (value: SetStateAction<Session | null>) => {
      if (!online) {
        setLocalActiveSession(value);
        return;
      }
      const next = resolve(value, onlineActive);
      if (!next) {
        setActiveId(null);
        setDraftActive(null);
        return;
      }
      setActiveId(next.id);
      const existing = currentSessions.find((session) => session.id === next.id);
      if (existing) {
        setDraftActive(null);
        if (existing !== next) {
          writeField('sessions', (prev) =>
            prev.map((session) => (session.id === next.id ? next : session)),
          );
        }
      } else {
        setDraftActive(next);
      }
    },
    [currentSessions, online, onlineActive, writeField],
  );

  const didCleanup = useRef(false);
  useEffect(() => {
    if (didCleanup.current || online) return;
    didCleanup.current = true;

    const cleaned = removeOrphanedSessionData({
      sessions,
      activeSession: localActiveSession,
      games,
      pointEvents,
      teams,
      gameReports,
      sessionReports,
    });

    if (cleaned.games.length !== games.length) setLocalGames(cleaned.games);
    if (cleaned.pointEvents.length !== pointEvents.length) setLocalPointEvents(cleaned.pointEvents);
    if (cleaned.teams.length !== teams.length) setLocalTeams(cleaned.teams);
    if (cleaned.gameReports.length !== gameReports.length) setLocalGameReports(cleaned.gameReports);
    if (cleaned.sessionReports.length !== sessionReports.length)
      setLocalSessionReports(cleaned.sessionReports);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeSession || activeSession.type !== 'tournament' || !activeSession.config) return;
    const format = activeSession.config.type === 'tournament' ? activeSession.config.format : null;
    if (format !== 'knockout' && format !== 'groups_knockout') return;

    const propagated = propagateKnockoutResults(
      currentGames,
      activeSession.id,
      activeSession.config as TournamentConfig,
    );
    if (JSON.stringify(propagated) !== JSON.stringify(currentGames)) {
      setGames(propagated);
    }
  }, [currentGames, activeSession, setGames]);

  const updateActiveSession = useCallback(
    (s: Session) => {
      if (!online) {
        setLocalActiveSession(s);
        setLocalSessions((prev) => prev.map((old) => (old.id === s.id ? s : old)));
        return;
      }
      setActiveSession(s);
    },
    [online, setActiveSession],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      const result = buildSessionDeletionResult({
        sessionId,
        sessions: currentSessions,
        games: currentGames,
        pointEvents: currentPointEvents,
        teams: currentTeams,
        gameReports: currentGameReports,
        sessionReports: currentSessionReports,
        now: new Date().toISOString(),
      });

      setSessions(result.sessions);
      setGames(result.games);
      setPointEvents(result.pointEvents);
      setTeams(result.teams);
      setGameReports(result.gameReports);
      setSessionReports(result.sessionReports);
    },
    [
      currentGameReports,
      currentGames,
      currentPointEvents,
      currentSessionReports,
      currentSessions,
      currentTeams,
      setGameReports,
      setGames,
      setPointEvents,
      setSessionReports,
      setSessions,
      setTeams,
    ],
  );

  const replaceLocal = useCallback(
    (bundle: Partial<SessionBundle> & { activeSession?: Session | null }) => {
      if (online) return;
      if (bundle.sessions) setLocalSessions(bundle.sessions);
      if (bundle.teams) setLocalTeams(bundle.teams);
      if (bundle.games) setLocalGames(bundle.games);
      if (bundle.pointEvents) setLocalPointEvents(bundle.pointEvents);
      if (bundle.gameReports) setLocalGameReports(bundle.gameReports);
      if (bundle.sessionReports) setLocalSessionReports(bundle.sessionReports);
      if (bundle.activeSession !== undefined) setLocalActiveSession(bundle.activeSession);
    },
    [online],
  );

  const readError = online && query.error ? toOnlineError(query.error) : null;
  const error = writeError ?? readError;
  const status: OnlineStatus = {
    loading: online && query.isPending,
    error,
    readError,
    offline: error?.kind === 'offline_unavailable',
  };

  return {
    sessions: currentSessions.filter((s) => !s.deletedAt),
    rawSessions: currentSessions,
    setSessions,
    deleteSession,
    activeSession,
    setActiveSession,
    updateActiveSession,
    teams: currentTeams,
    setTeams,
    games: currentGames,
    setGames,
    pointEvents: livePointEvents,
    rawPointEvents: currentPointEvents,
    setPointEvents,
    gameReports: currentGameReports,
    setGameReports,
    sessionReports: currentSessionReports,
    setSessionReports,
    online,
    status,
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
    flush: () => writeChain.current,
    replaceLocal,
  };
}
