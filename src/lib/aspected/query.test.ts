import { describe, expect, it } from "vitest"
import { buildSparseSearchRequest, parseAccessFilter } from "./query.ts"

describe("buildSparseSearchRequest", () => {
  it("omits blank aspects", () => {
    const request = buildSparseSearchRequest({
      k: 5,
      aspects: [
        { name: "category", value: "electronics", weight: "2" },
        { name: "colour", value: "  ", weight: "" },
      ],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: true,
      withVectors: false,
      withExplanation: true,
    })

    expect(request.query).toEqual({ category: "electronics" })
    expect(request.weights).toEqual({ category: 2 })
    expect(request.accessFilter).toBeUndefined()
  })

  it("parses numeric aspect values", () => {
    const request = buildSparseSearchRequest({
      k: 3,
      aspects: [{ name: "price", value: "12.5", weight: "" }],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: false,
      withVectors: false,
      withExplanation: false,
    })

    expect(request.query).toEqual({ price: 12.5 })
  })
})

describe("parseAccessFilter", () => {
  it("returns undefined when empty", () => {
    expect(parseAccessFilter("", false)).toBeUndefined()
  })

  it("includes a null entry when requested", () => {
    expect(parseAccessFilter("team-a", true)).toEqual(["team-a", null])
    expect(parseAccessFilter("", true)).toEqual([null])
  })
})
