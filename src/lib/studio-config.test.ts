import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_BASE_URL } from "@/lib/aspected/connection.ts"
import {
  bundledWelcomeCopy,
  defaultBaseUrlForStudio,
  isStudioBundled,
} from "./studio-config.ts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("isStudioBundled", () => {
  it("reads the build-time flag from import.meta.env", () => {
    // Vitest injects VITE_STUDIO_BUNDLED as false for the root-base test run.
    expect(typeof isStudioBundled()).toBe("boolean")
  })
})

describe("defaultBaseUrlForStudio", () => {
  it("uses the Docker default when not bundled", () => {
    expect(defaultBaseUrlForStudio(false)).toBe(DEFAULT_BASE_URL)
    expect(defaultBaseUrlForStudio(false, "http://127.0.0.1:9000")).toBe(
      DEFAULT_BASE_URL,
    )
  })

  it("uses the page origin when bundled", () => {
    expect(
      defaultBaseUrlForStudio(true, "http://127.0.0.1:8080/studio/"),
    ).toBe("http://127.0.0.1:8080")
  })

  it("falls back to the Docker default when the origin is missing", () => {
    expect(defaultBaseUrlForStudio(true, "")).toBe(DEFAULT_BASE_URL)
  })
})

describe("bundledWelcomeCopy", () => {
  it("mentions same-origin serving", () => {
    expect(bundledWelcomeCopy()).toContain("same origin")
  })
})
