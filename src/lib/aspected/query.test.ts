import { describe, expect, it } from "vitest"
import {
  buildSparseSearchRequest,
  parseAccessFilter,
  searchFormSchema,
  searchWeightSchema,
} from "./query.ts"
import { MAX_WEIGHT } from "./playground.ts"
import type { StoredAspect } from "./types.ts"

describe("buildSparseSearchRequest", () => {
  it("omits blank aspects", () => {
    const request = buildSparseSearchRequest({
      k: 5,
      aspects: [
        { name: "category", type: "enum", value: "electronics", weight: "2" },
        { name: "colour", type: "text", value: "  ", weight: "" },
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

  it("coerces number and raw aspect values by type", () => {
    const request = buildSparseSearchRequest({
      k: 3,
      aspects: [
        { name: "price", type: "number", value: "12.5", weight: "" },
        {
          name: "embedding",
          type: "raw",
          value: "[0.1, 0.2]",
          weight: "",
        },
      ],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: false,
      withVectors: false,
      withExplanation: false,
    })

    expect(request.query).toEqual({
      price: 12.5,
      embedding: { $raw: [0.1, 0.2] },
    })
  })
})

describe("searchWeightSchema", () => {
  it("allows blank and in-range numbers", () => {
    expect(searchWeightSchema.safeParse("").success).toBe(true)
    expect(searchWeightSchema.safeParse("1").success).toBe(true)
    expect(searchWeightSchema.safeParse("0").success).toBe(true)
    expect(searchWeightSchema.safeParse(String(MAX_WEIGHT)).success).toBe(true)
  })

  it("rejects non-numbers and out-of-range values", () => {
    expect(searchWeightSchema.safeParse("abc").success).toBe(false)
    expect(searchWeightSchema.safeParse("-1").success).toBe(false)
    expect(searchWeightSchema.safeParse(String(MAX_WEIGHT + 1)).success)
      .toBe(false)
  })
})

describe("searchFormSchema", () => {
  const schema: StoredAspect[] = [
    {
      name: "price",
      type: "number",
      path: "$.price",
      settings: { min: 0, max: 100 },
    },
  ]

  it("rejects out-of-range aspect values and weights", () => {
    const result = searchFormSchema(schema).safeParse({
      k: "5",
      aspects: [
        { name: "price", type: "number", value: "250", weight: "abc" },
      ],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: true,
      withExplanation: true,
      withVectors: false,
    })
    expect(result.success).toBe(false)
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
