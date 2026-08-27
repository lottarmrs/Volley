import { useState, useEffect, useCallback, useRef } from 'react';
import {
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

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() =>
    normalizeSessions(loadFromStorage(STORAGE_KEYS.sessions, [])),
  );
  const [activeSession, setActiveSession] = useState<Session | null>(() => {
    const loaded = loadFromStorage<Session | null>(STORAGE_KEYS.activeSession, null);
    return loaded ? normalizeSession(loaded) : null;
  });
  const [teams, setTeams] = useState<Team[]>(() => loadFromStorage(STORAGE_KEYS.teams, []));
  const [games, setGames] = useState<Game[]>(() =>
    normalizeGames(loadFromStorage(STORAGE_KEYS.games, [])),
  );
  const [pointEvents, setPointEvents] = useState<PointEvent[]>(() =>
    loadFromStorage(STORAGE_KEYS.points, []),
  );
  const [gameReports, setGameReports] = useState<GameReport[]>(() =>
    loadFromStorage(STORAGE_KEYS.gameReports, []),
  );
  const [sessionReports, setSessionReports] = useState<SessionReport[]>(() =>
    loadFromStorage(STORAGE_KEYS.sessionReports, []),
  );

  // Persist every slice to localStorage
  useEffect(() => saveToStorage(STORAGE_KEYS.sessions, sessions), [sessions]);
  useEffect(() => saveToStorage(STORAGE_KEYS.activeSession, activeSession), [activeSession]);
  useEffect(() => saveToStorage(STORAGE_KEYS.teams, teams), [teams]);
  useEffect(() => saveToStorage(STORAGE_KEYS.games, games), [games]);
  useEffect(() => saveToStorage(STORAGE_KEYS.points, pointEvents), [pointEvents]);
  useEffect(() => saveToStorage(STORAGE_KEYS.gameReports, gameReports), [gameReports]);
  useEffect(() => saveToStorage(STORAGE_KEYS.sessionReports, sessionReports), [sessionReports]);

  // One-time startup cleanup: remove orphaned data whose sessionId
  // doesn't match any existing session or the active session.
  const didCleanup = useRef(false);
  useEffect(() => {
    if (didCleanup.current) return;
    didCleanup.current = true;

    const cleaned = removeOrphanedSessionData({
      sessions,
      activeSession,
      games,
      pointEvents,
      teams,
      gameReports,
      sessionReports,
    });

    if (cleaned.games.length !== games.length) setGames(cleaned.games);
    if (cleaned.pointEvents.length !== pointEvents.length) setPointEvents(cleaned.pointEvents);
    if (cleaned.teams.length !== teams.length) setTeams(cleaned.teams);
    if (cleaned.gameReports.length !== gameReports.length) setGameReports(cleaned.gameReports);
    if (cleaned.sessionReports.length !== sessionReports.length)
      setSessionReports(cleaned.sessionReports);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Propagate knockout results reactively
  useEffect(() => {
    if (!activeSession || activeSession.type !== 'tournament' || !activeSession.config) return;
    const format = activeSession.config.type === 'tournament' ? activeSession.config.format : null;
    if (format !== 'knockout' && format !== 'groups_knockout') return;

    const propagated = propagateKnockoutResults(
      games,
      activeSession.id,
      activeSession.config as TournamentConfig,
    );
    if (JSON.stringify(propagated) !== JSON.stringify(games)) {
      setGames(propagated);
    }
  }, [games, activeSession]);

  /** Keeps activeSession in sync with sessions list */
  const updateActiveSession = useCallback((s: Session) => {
    setActiveSession(s);
    setSessions((prev) => prev.map((old) => (old.id === s.id ? s : old)));
  }, []);

  const deleteSession = useCallback(
    (sessionId: string) => {
      const result = buildSessionDeletionResult({
        sessionId,
        sessions,
        games,
        pointEvents,
        teams,
        gameReports,
        sessionReports,
        now: new Date().toISOString(),
      });

      setSessions(result.sessions);
      setGames(result.games);
      setPointEvents(result.pointEvents);
      setTeams(result.teams);
      setGameReports(result.gameReports);
      setSessionReports(result.sessionReports);
    },
    [gameReports, games, pointEvents, sessionReports, sessions, teams],
  );

  return {
    sessions: sessions.filter((s) => !s.deletedAt),
    rawSessions: sessions,
    setSessions,
    deleteSession,
    activeSession,
    setActiveSession,
    updateActiveSession,
    teams,
    setTeams,
    games,
    setGames,
    pointEvents,
    setPointEvents,
    gameReports,
    setGameReports,
    sessionReports,
    setSessionReports,
  };
}
