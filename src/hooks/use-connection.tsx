import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AspectedApiError, AspectedClient } from "@/lib/aspected/client.ts";
import {
  type ConnectionSettings,
  DEFAULT_CONNECTION_SETTINGS,
  isSavedConnection,
  loadConnections,
  removeConnection as persistRemove,
  type SavedConnection,
  type SavedConnectionInput,
  toConnectionSettings,
  upsertConnection as persistUpsert,
} from "@/lib/aspected/connection.ts";
import { toUserFacingError } from "@/lib/aspected/user-error.ts";
import type { StatusResponse } from "@/lib/aspected/types.ts";

/** Delays (in ms) between successive auto-retry attempts after a mid-session drop. */
const RETRY_DELAYS = [2_000, 5_000, 10_000];

/** How often (in ms) to poll /status while connected, to detect server going away. */
const HEARTBEAT_INTERVAL = 30_000;

type ConnectionContextValue = {
  settings: ConnectionSettings;
  client: AspectedClient;
  status: StatusResponse | null;
  statusReceivedAt: number | null;
  error: string | null;
  connecting: boolean;
  /**
   * True once a connection has succeeded in this session.
   * Stays true through drops so the shell can show a "lost connection"
   * overlay instead of the welcome screen.
   */
  wasConnected: boolean;
  /** True while the auto-reconnect retry loop is running after a drop. */
  retrying: boolean;
  /** Seconds until the next auto-reconnect attempt, or null when not retrying. */
  nextRetryIn: number | null;
  activeId: string | null;
  connections: SavedConnection[];
  upsertConnection: (input: SavedConnectionInput) => SavedConnection;
  deleteConnection: (id: string) => void;
  connect: (
    target: ConnectionSettings | SavedConnection,
  ) => Promise<StatusResponse>;
  disconnect: () => void;
  /** Reconnect to the current settings; starts auto-retry on failure. */
  reconnect: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionContextValue | undefined>(
  undefined,
);

/**
 * Provides saved connections and an explicit live Aspected session.
 * Opening Studio does not connect until the user chooses a server.
 *
 * Liveness detection runs on two paths:
 * - Any API call that fails with a network error (status 0) immediately
 *   invalidates the session via the `onNetworkError` hook on `AspectedClient`.
 * - A periodic heartbeat polls `/status` every 30 s while connected.
 *
 * Both paths call `handleDrop()`, which clears `status`, keeps `wasConnected`
 * true so the shell shows the "Connection lost" overlay, and starts an
 * auto-retry cycle (2 s, 5 s, 10 s).
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<SavedConnection[]>(() =>
    loadConnections()
  );
  const [settings, setSettings] = useState<ConnectionSettings>(
    DEFAULT_CONNECTION_SETTINGS,
  );
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusReceivedAt, setStatusReceivedAt] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

  // Stable refs so async callbacks can read current values without stale closures.
  const statusRef = useRef<StatusResponse | null>(null);
  statusRef.current = status;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const settingsRef = useRef<ConnectionSettings>(DEFAULT_CONNECTION_SETTINGS);
  settingsRef.current = settings;

  // Refs for the retry scheduler.
  const retryAttemptRef = useRef(0);
  const retrySettingsRef = useRef<ConnectionSettings | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRetryTimers = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const stopRetry = useCallback(() => {
    clearRetryTimers();
    retryAttemptRef.current = 0;
    retrySettingsRef.current = null;
    setRetrying(false);
    setNextRetryIn(null);
  }, [clearRetryTimers]);

  // Forward-declared so scheduleRetry and retryOnce can reference each other.
  const scheduleRetryRef = useRef<(attempt: number) => void>(() => {});

  const retryOnce = useCallback(async () => {
    const snap = retrySettingsRef.current;
    if (!snap) return;
    const idSnap = activeIdRef.current;
    try {
      const nextClient = new AspectedClient(snap);
      const result = await nextClient.getStatus();
      stopRetry();
      setStatus(result);
      setStatusReceivedAt(Date.now());
      setActiveId(idSnap);
      setError(null);
    } catch {
      // Next attempt is scheduled by the timer callback below.
    }
  }, [stopRetry]);

  useEffect(() => {
    scheduleRetryRef.current = (attempt: number) => {
      if (attempt >= RETRY_DELAYS.length) {
        setRetrying(false);
        setNextRetryIn(null);
        retryAttemptRef.current = 0;
        return;
      }

      const delayMs = RETRY_DELAYS[attempt];
      const delaySec = Math.round(delayMs / 1_000);

      retryAttemptRef.current = attempt + 1;
      setRetrying(true);
      setNextRetryIn(delaySec);

      clearRetryTimers();

      let remaining = delaySec;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setNextRetryIn(remaining > 0 ? remaining : null);
        if (remaining <= 0) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
        }
      }, 1_000);

      retryTimerRef.current = setTimeout(async () => {
        retryTimerRef.current = null;
        await retryOnce();
        if (statusRef.current === null && retrySettingsRef.current) {
          scheduleRetryRef.current(retryAttemptRef.current);
        }
      }, delayMs);
    };
  }, [clearRetryTimers, retryOnce]);

  /**
   * Start the auto-retry cycle using a settings snapshot.
   * Called by handleDrop and reconnect.
   */
  const startRetry = useCallback((settingsSnap: ConnectionSettings) => {
    retrySettingsRef.current = settingsSnap;
    retryAttemptRef.current = 0;
    scheduleRetryRef.current(0);
  }, []);

  /**
   * Invalidate the live session after a network-level drop.
   * Keeps wasConnected true so the shell shows the overlay, and starts
   * the auto-retry cycle.
   */
  const handleDrop = useCallback(() => {
    // Guard: only trigger if we were actually connected. This prevents
    // the handleDrop callback on a stale client from firing after the user
    // has already switched connections or disconnected.
    if (!statusRef.current) return;
    setStatus(null);
    setStatusReceivedAt(null);
    setWasConnected(true);
    startRetry(settingsRef.current);
  }, [startRetry]);

  const upsertConnection = useCallback((input: SavedConnectionInput) => {
    const saved = persistUpsert(input);
    setConnections(loadConnections());
    return saved;
  }, []);

  const disconnect = useCallback(() => {
    stopRetry();
    setStatus(null);
    setStatusReceivedAt(null);
    setActiveId(null);
    setError(null);
    setWasConnected(false);
  }, [stopRetry]);

  const deleteConnection = useCallback((id: string) => {
    setConnections(persistRemove(id));
    if (activeIdRef.current === id) {
      stopRetry();
      setActiveId(null);
      setStatus(null);
      setStatusReceivedAt(null);
      setError(null);
      setWasConnected(false);
    }
  }, [stopRetry]);

  /**
   * Wire handleDrop into the client so any page-level network failure
   * immediately invalidates the session.
   */
  const client = useMemo(
    () => new AspectedClient(settings, { onNetworkError: handleDrop }),
    [settings, handleDrop],
  );

  const connect = useCallback(
    async (target: ConnectionSettings | SavedConnection) => {
      const next = isSavedConnection(target)
        ? toConnectionSettings(target)
        : target;
      const nextId = isSavedConnection(target) ? target.id : null;

      // A manual connect always cancels any in-progress retry cycle.
      stopRetry();

      setSettings(next);
      setConnecting(true);
      setStatus(null);
      setStatusReceivedAt(null);
      setActiveId(null);
      // Use a bare client without onNetworkError so a failed initial connect
      // does not trigger the mid-session drop overlay.
      const nextClient = new AspectedClient(next);
      try {
        const result = await nextClient.getStatus();
        setStatus(result);
        setStatusReceivedAt(Date.now());
        setActiveId(nextId);
        setError(null);
        setWasConnected(true);
        return result;
      } catch (caught) {
        setStatus(null);
        setStatusReceivedAt(null);
        setActiveId(null);
        const userError = toUserFacingError(caught, "Cannot reach Aspected");
        setError(userError.title);
        throw caught instanceof Error ? caught : new Error(userError.title);
      } finally {
        setConnecting(false);
      }
    },
    [stopRetry],
  );

  /**
   * Reconnect using the currently active settings. Used by the overlay's
   * "Reconnect" button. On failure, starts the auto-retry cycle.
   */
  const reconnect = useCallback(async () => {
    stopRetry();
    setConnecting(true);
    setError(null);
    const snap = settingsRef.current;
    const idSnap = activeIdRef.current;
    const nextClient = new AspectedClient(snap);
    try {
      const result = await nextClient.getStatus();
      setStatus(result);
      setStatusReceivedAt(Date.now());
      setActiveId(idSnap);
      setError(null);
      setWasConnected(true);
    } catch (caught) {
      const userError = toUserFacingError(caught, "Cannot reach Aspected");
      setError(userError.title);
      startRetry(snap);
    } finally {
      setConnecting(false);
    }
  }, [startRetry, stopRetry]);

  /**
   * Periodic heartbeat: poll /status every 30 s while connected.
   * Detects server going away even when the user is idle.
   * Non-network errors (4xx, 5xx) do not invalidate the session.
   */
  useEffect(() => {
    if (!status) return;
    const id = setInterval(async () => {
      try {
        const result = await client.getStatus();
        setStatus(result);
        setStatusReceivedAt(Date.now());
      } catch (e) {
        // Treat Vite proxy failures as connection drops too. In practice,
        // when the upstream server is down the dev proxy often yields
        // HTTP 502/503/504 instead of a fetch-throw network error.
        if (
          e instanceof AspectedApiError &&
          (e.status === 0 || e.status === 502 || e.status === 503 ||
            e.status === 504)
        ) {
          handleDrop();
        }
      }
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [status, client, handleDrop]);

  const value = useMemo(
    () => ({
      settings,
      client,
      status,
      statusReceivedAt,
      error,
      connecting,
      wasConnected,
      retrying,
      nextRetryIn,
      activeId,
      connections,
      upsertConnection,
      deleteConnection,
      connect,
      disconnect,
      reconnect,
    }),
    [
      settings,
      client,
      status,
      statusReceivedAt,
      error,
      connecting,
      wasConnected,
      retrying,
      nextRetryIn,
      activeId,
      connections,
      upsertConnection,
      deleteConnection,
      connect,
      disconnect,
      reconnect,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

/**
 * Access the current Aspected connection session and saved list.
 */
export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return context;
}
