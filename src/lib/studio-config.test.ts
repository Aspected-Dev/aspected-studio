import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_BASE_URL } from "@/lib/aspected/connection.ts"
import {
  bundledWelcomeCopy,
  defaultBaseUrlForStudio,
  loadStudioConfig,
  STUDIO_CONFIG_URL,
} from "./studio-config.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("loadStudioConfig", () => {
  it("returns null when config is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    expect(await loadStudioConfig(fetchImpl)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledWith(STUDIO_CONFIG_URL, {
      cache: "no-store",
    })
  })

  it("returns null when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    expect(await loadStudioConfig(fetchImpl)).toBeNull()
  })

  it("returns null for invalid JSON shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bundled: "yes" }),
    })
    expect(await loadStudioConfig(fetchImpl)).toBeNull()
  })

  it("parses a bundled config with apiPort", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bundled: true, apiPort: 8080 }),
    })
    expect(await loadStudioConfig(fetchImpl)).toEqual({
      bundled: true,
      apiPort: 8080,
    })
  })
})

describe("defaultBaseUrlForStudio", () => {
  it("uses the Docker default when not bundled", () => {
    expect(defaultBaseUrlForStudio(null)).toBe(DEFAULT_BASE_URL)
    expect(defaultBaseUrlForStudio({ bundled: false })).toBe(DEFAULT_BASE_URL)
  })

  it("uses hostname plus apiPort when bundled", () => {
    expect(
      defaultBaseUrlForStudio(
        { bundled: true, apiPort: 8080 },
        "http://127.0.0.1:8081/",
      ),
    ).toBe("http://127.0.0.1:8080")
  })

  it("falls back to the Docker default when apiPort is missing", () => {
    expect(
      defaultBaseUrlForStudio({ bundled: true }, "http://127.0.0.1:8081/"),
    ).toBe(DEFAULT_BASE_URL)
  })
})

describe("bundledWelcomeCopy", () => {
  it("includes Studio and API ports", () => {
    expect(
      bundledWelcomeCopy({ port: "8081", protocol: "http:" }, 8080),
    ).toContain("port 8081")
    expect(
      bundledWelcomeCopy({ port: "8081", protocol: "http:" }, 8080),
    ).toContain("port 8080")
  })

  it("uses the default http port when location.port is empty", () => {
    expect(
      bundledWelcomeCopy({ port: "", protocol: "http:" }),
    ).toContain("port 80")
  })
})
