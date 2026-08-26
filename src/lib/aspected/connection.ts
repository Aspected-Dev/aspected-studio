import { z } from "zod"

/** React Hook Form schema for the new/edit connection dialog. */
export const connectionFormSchema = z.object({
  /** Optional display name. Falls back to the host label on save. */
  name: z.string(),
  /** Full server origin, e.g. http://localhost:8080. */
  baseUrl: z
    .string()
    .min(1, "Server URL is required")
    .url("Must be a valid URL (include http:// or https://)"),
  /** Bearer token. Leave empty when the server has no staticApiToken. */
  apiToken: z.string(),
})

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>

/** localStorage key for the saved connection list. */
export const CONNECTIONS_STORAGE_KEY = "aspected-studio.connections"

/** Legacy single-connection key. Read once for migrate, then ignored. */
export const LEGACY_CONNECTION_STORAGE_KEY = "aspected-studio.connection"

/** Default Aspected URL used by Docker quick start. */
export const DEFAULT_BASE_URL = "http://localhost:8080"

/** Same-origin prefix rewritten by the Vite dev proxy. */
export const LOCAL_API_PREFIX = "/api"

/** Connection settings used by the live Aspected client. */
export type ConnectionSettings = {
  baseUrl: string
  apiToken: string
}

/** A named server saved in this browser. */
export type SavedConnection = {
  id: string
  name: string
  baseUrl: string
  apiToken: string
}

/** Draft used to create or update a saved connection. */
export type SavedConnectionInput = {
  id?: string
  name: string
  baseUrl: string
  apiToken: string
}

/** Default client settings before the user connects. */
export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = {
  baseUrl: DEFAULT_BASE_URL,
  apiToken: "",
}

const savedConnectionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  baseUrl: z.string().min(1),
  apiToken: z.string(),
})

const savedConnectionsSchema = z.array(savedConnectionSchema)

const legacyConnectionSchema = z.object({
  baseUrl: z.string(),
  apiToken: z.string().optional(),
})

/**
 * Creates a unique id for a new saved connection.
 */
export function newConnectionId(): string {
  return crypto.randomUUID()
}

/**
 * True when the connect target is a saved list row rather than a draft.
 */
export function isSavedConnection(
  target: ConnectionSettings | SavedConnection,
): target is SavedConnection {
  return "id" in target && typeof target.id === "string"
}

/**
 * Client settings taken from a saved connection.
 */
export function toConnectionSettings(
  connection: SavedConnection,
): ConnectionSettings {
  return {
    baseUrl: connection.baseUrl,
    apiToken: connection.apiToken,
  }
}

/**
 * Reads the saved connection list. Migrates the old single connection once.
 * Invalid JSON or schema falls back to an empty list.
 */
export function loadConnections(): SavedConnection[] {
  const stored = readStoredConnections()
  if (stored !== null) {
    return stored
  }

  const migrated = migrateLegacyConnection()
  if (migrated.length > 0) {
    saveConnections(migrated)
  }
  return migrated
}

/**
 * Persists the saved connection list.
 */
export function saveConnections(connections: SavedConnection[]): void {
  localStorage.setItem(
    CONNECTIONS_STORAGE_KEY,
    JSON.stringify(connections),
  )
}

/**
 * Inserts or replaces a saved connection and writes the list.
 * Empty names fall back to the host label.
 */
export function upsertConnection(
  input: SavedConnectionInput,
): SavedConnection {
  const baseUrl = input.baseUrl.trim() || DEFAULT_BASE_URL
  const saved: SavedConnection = {
    id: input.id ?? newConnectionId(),
    name: input.name.trim() || displayHost(baseUrl),
    baseUrl,
    apiToken: input.apiToken,
  }
  const current = loadConnections()
  const index = current.findIndex((item) => item.id === saved.id)
  const next = index === -1
    ? [...current, saved]
    : current.map((item, itemIndex) => itemIndex === index ? saved : item)
  saveConnections(next)
  return saved
}

/**
 * Removes a saved connection and returns the remaining list.
 */
export function removeConnection(id: string): SavedConnection[] {
  const next = loadConnections().filter((item) => item.id !== id)
  saveConnections(next)
  return next
}

/**
 * Resolves the fetch origin. The default local server uses `/api` so the Vite
 * proxy can avoid CORS. Any other URL is called directly.
 */
export function resolveApiBase(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "")
  if (!normalized || normalized === DEFAULT_BASE_URL) {
    return LOCAL_API_PREFIX
  }

  return normalized
}

/**
 * Host label for a connection, e.g. `localhost:8080`.
 */
export function displayHost(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "") || DEFAULT_BASE_URL
  try {
    return new URL(normalized).host
  } catch {
    return normalized
  }
}

/**
 * Server origin to copy, without a trailing slash or API token.
 */
export function serverUrlForCopy(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") || DEFAULT_BASE_URL
}

/**
 * Index REST URL to copy (`GET /indexes/{name}`), without a token.
 */
export function indexUrlForCopy(baseUrl: string, name: string): string {
  return `${serverUrlForCopy(baseUrl)}/indexes/${encodeURIComponent(name)}`
}

/**
 * True when URL and token match, ignoring trailing slashes on the URL.
 */
export function connectionSettingsEqual(
  left: ConnectionSettings,
  right: ConnectionSettings,
): boolean {
  return left.baseUrl.replace(/\/+$/, "") ===
      right.baseUrl.replace(/\/+$/, "") &&
    left.apiToken === right.apiToken
}

function readStoredConnections(): SavedConnection[] | null {
  const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY)
  if (raw === null) {
    return null
  }

  try {
    const parsed = savedConnectionsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function migrateLegacyConnection(): SavedConnection[] {
  const raw = localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY)
  localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = legacyConnectionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      return []
    }

    const baseUrl = parsed.data.baseUrl.trim() || DEFAULT_BASE_URL
    return [{
      id: newConnectionId(),
      name: displayHost(baseUrl),
      baseUrl,
      apiToken: parsed.data.apiToken ?? "",
    }]
  } catch {
    return []
  }
}
