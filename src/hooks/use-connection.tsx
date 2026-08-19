import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AspectedClient } from "@/lib/aspected/client.ts";
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

type ConnectionContextValue = {
  settings: ConnectionSettings;
  client: AspectedClient;
  status: StatusResponse | null;
  statusReceivedAt: number | null;
  error: string | null;
  connecting: boolean;
  activeId: string | null;
  connections: SavedConnection[];
  upsertConnection: (input: SavedConnectionInput) => SavedConnection;
  deleteConnection: (id: string) => void;
  connect: (
    target: ConnectionSettings | SavedConnection,
  ) => Promise<StatusResponse>;
  disconnect: () => void;
};

const ConnectionContext = createContext<ConnectionContextValue | undefined>(
  undefined,
);

/**
 * Provides saved connections and an explicit live Aspected session.
 * Opening Studio does not connect until the user chooses a server.
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

  const client = useMemo(() => new AspectedClient(settings), [settings]);

  const upsertConnection = useCallback((input: SavedConnectionInput) => {
    const saved = persistUpsert(input);
    setConnections(loadConnections());
    return saved;
  }, []);

  const disconnect = useCallback(() => {
    setStatus(null);
    setStatusReceivedAt(null);
    setActiveId(null);
    setError(null);
  }, []);

  const deleteConnection = useCallback((id: string) => {
    setConnections(persistRemove(id));
    if (activeId === id) {
      setActiveId(null);
      setStatus(null);
      setStatusReceivedAt(null);
      setError(null);
    }
  }, [activeId]);

  const connect = useCallback(
    async (target: ConnectionSettings | SavedConnection) => {
      const next = isSavedConnection(target)
        ? toConnectionSettings(target)
        : target;
      const nextId = isSavedConnection(target) ? target.id : null;
      setSettings(next);
      setConnecting(true);
      setStatus(null);
      setStatusReceivedAt(null);
      setActiveId(null);
      const nextClient = new AspectedClient(next);
      try {
        const result = await nextClient.getStatus();
        setStatus(result);
        setStatusReceivedAt(Date.now());
        setActiveId(nextId);
        setError(null);
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
    [],
  );

  const value = useMemo(
    () => ({
      settings,
      client,
      status,
      statusReceivedAt,
      error,
      connecting,
      activeId,
      connections,
      upsertConnection,
      deleteConnection,
      connect,
      disconnect,
    }),
    [
      settings,
      client,
      status,
      statusReceivedAt,
      error,
      connecting,
      activeId,
      connections,
      upsertConnection,
      deleteConnection,
      connect,
      disconnect,
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
