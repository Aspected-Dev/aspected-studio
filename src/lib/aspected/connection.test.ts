import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CONNECTIONS_STORAGE_KEY,
  connectionSettingsEqual,
  DEFAULT_BASE_URL,
  displayHost,
  indexUrlForCopy,
  LEGACY_CONNECTION_STORAGE_KEY,
  loadConnections,
  LOCAL_API_PREFIX,
  removeConnection,
  resolveApiBase,
  serverUrlForCopy,
  upsertConnection,
} from "./connection.ts"

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("resolveApiBase", () => {
  it("uses the Vite proxy for the default local URL in DEV", () => {
    expect(resolveApiBase(DEFAULT_BASE_URL)).toBe(LOCAL_API_PREFIX)
    expect(resolveApiBase("http://localhost:8080/")).toBe(LOCAL_API_PREFIX)
    expect(resolveApiBase("")).toBe(LOCAL_API_PREFIX)
  })

  it("keeps a custom origin as an absolute URL", () => {
    expect(resolveApiBase("https://aspected.example:9090")).toBe(
      "https://aspected.example:9090",
    )
    expect(
      resolveApiBase(
        "https://aspected.example:9090",
        "http://localhost:5173",
      ),
    ).toBe("https://aspected.example:9090")
  })

  it("keeps a non-default localhost absolute when it is not the Docker default", () => {
    expect(
      resolveApiBase("http://127.0.0.1:8080", "http://127.0.0.1:8081"),
    ).toBe("http://127.0.0.1:8080")
  })
})

describe("displayHost", () => {
  it("returns the host and port", () => {
    expect(displayHost("http://localhost:8080/")).toBe("localhost:8080")
  })
})

describe("serverUrlForCopy", () => {
  it("strips a trailing slash and never includes a token", () => {
    expect(serverUrlForCopy("http://localhost:8080/")).toBe(
      "http://localhost:8080",
    )
  })
})

describe("indexUrlForCopy", () => {
  it("builds GET /indexes/{name} without a token", () => {
    expect(indexUrlForCopy("http://localhost:8080/", "my index")).toBe(
      "http://localhost:8080/indexes/my%20index",
    )
  })
})

describe("connectionSettingsEqual", () => {
  it("ignores trailing slashes on the URL", () => {
    expect(
      connectionSettingsEqual(
        { baseUrl: "http://localhost:8080/", apiToken: "" },
        { baseUrl: "http://localhost:8080", apiToken: "" },
      ),
    ).toBe(true)
  })

  it("treats a different token as a change", () => {
    expect(
      connectionSettingsEqual(
        { baseUrl: DEFAULT_BASE_URL, apiToken: "" },
        { baseUrl: DEFAULT_BASE_URL, apiToken: "secret" },
      ),
    ).toBe(false)
  })
})

describe("loadConnections", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadConnections()).toEqual([])
  })

  it("round-trips saved connections", () => {
    const saved = upsertConnection({
      name: "Prod",
      baseUrl: "https://aspected.example:9090",
      apiToken: "secret",
    })

    expect(saved.name).toBe("Prod")
    expect(loadConnections()).toEqual([saved])
  })

  it("falls back to an empty list for invalid JSON", () => {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, "{not json")
    expect(loadConnections()).toEqual([])
  })

  it("falls back to an empty list for an invalid schema", () => {
    localStorage.setItem(
      CONNECTIONS_STORAGE_KEY,
      JSON.stringify([{ name: "missing-id" }]),
    )
    expect(loadConnections()).toEqual([])
  })

  it("migrates the legacy single connection then stops reading it", () => {
    localStorage.setItem(
      LEGACY_CONNECTION_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "http://localhost:8080/",
        apiToken: "legacy-token",
      }),
    )

    const migrated = loadConnections()
    expect(migrated).toHaveLength(1)
    expect(migrated[0].name).toBe("localhost:8080")
    expect(migrated[0].baseUrl).toBe("http://localhost:8080/")
    expect(migrated[0].apiToken).toBe("legacy-token")
    expect(localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY)).toBeNull()

    localStorage.setItem(
      LEGACY_CONNECTION_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://should-not-migrate.example",
        apiToken: "",
      }),
    )
    expect(loadConnections()).toEqual(migrated)
  })

  it("does not migrate when the new list key already exists", () => {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify([]))
    localStorage.setItem(
      LEGACY_CONNECTION_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://legacy.example",
        apiToken: "",
      }),
    )

    expect(loadConnections()).toEqual([])
  })
})

describe("upsertConnection and removeConnection", () => {
  it("defaults an empty name to the host label", () => {
    const saved = upsertConnection({
      name: "  ",
      baseUrl: "https://aspected.example:9090",
      apiToken: "",
    })
    expect(saved.name).toBe("aspected.example:9090")
  })

  it("replaces an existing id", () => {
    const created = upsertConnection({
      name: "Local",
      baseUrl: DEFAULT_BASE_URL,
      apiToken: "",
    })
    const updated = upsertConnection({
      id: created.id,
      name: "Docker",
      baseUrl: DEFAULT_BASE_URL,
      apiToken: "token",
    })

    expect(loadConnections()).toEqual([updated])
    expect(updated.id).toBe(created.id)
    expect(updated.name).toBe("Docker")
  })

  it("removes a connection by id", () => {
    const keep = upsertConnection({
      name: "Keep",
      baseUrl: DEFAULT_BASE_URL,
      apiToken: "",
    })
    const drop = upsertConnection({
      name: "Drop",
      baseUrl: "https://other.example",
      apiToken: "",
    })

    expect(removeConnection(drop.id)).toEqual([keep])
    expect(loadConnections()).toEqual([keep])
  })
})
