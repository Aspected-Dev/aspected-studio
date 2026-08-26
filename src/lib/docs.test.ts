import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DOCS_HASH,
  DOCS_ORIGIN,
  docsPageForAspectType,
  docsUrl,
  openDocs,
} from "./docs.ts"

describe("docsUrl", () => {
  it("joins origin, path, and trailing slash", () => {
    expect(docsUrl("gettingStarted")).toBe(
      `${DOCS_ORIGIN}/getting-started/`,
    )
    expect(docsUrl("home")).toBe(`${DOCS_ORIGIN}/`)
    expect(docsUrl("resolverEnum")).toBe(`${DOCS_ORIGIN}/resolvers/enum/`)
  })

  it("appends a heading hash without a duplicate hash sign", () => {
    expect(docsUrl("resolvers", DOCS_HASH.jsonPath)).toBe(
      `${DOCS_ORIGIN}/resolvers/#jsonpath-expressions`,
    )
    expect(docsUrl("hnsw", "#m")).toBe(
      `${DOCS_ORIGIN}/user-manual/hnsw-parameters/#m`,
    )
  })
})

describe("openDocs", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("opens the docs URL in a new window", () => {
    const open = vi.fn().mockReturnValue(null)
    vi.stubGlobal("open", open)
    openDocs("security", DOCS_HASH.apiToken)
    expect(open).toHaveBeenCalledWith(
      `${DOCS_ORIGIN}/user-manual/security/#api-token-authentication`,
      "_blank",
      "noopener,noreferrer",
    )
  })
})

describe("docsPageForAspectType", () => {
  it("maps each resolver type", () => {
    expect(docsPageForAspectType("enum")).toBe("resolverEnum")
    expect(docsPageForAspectType("dict")).toBe("resolverDict")
  })
})
