import { describe, expect, it } from "vitest"
import {
  buildSparseSearchRequest,
  parseAccessFilter,
  searchFormSchema,
} from "./query.ts"
import type { StoredAspect } from "./types.ts"

describe("buildSparseSearchRequest", () => {
  it("omits blank aspects and weight 1", () => {
    const request = buildSparseSearchRequest({
      k: 5,
      aspects: [
        { name: "category", type: "enum", value: "electronics", weight: 2 },
        { name: "colour", type: "text", value: "  ", weight: 1 },
        { name: "brand", type: "text", value: "aurora", weight: 1 },
      ],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: true,
      withVectors: false,
      withExplanation: true,
    })

    expect(request.query).toEqual({
      category: "electronics",
      brand: "aurora",
    })
    expect(request.weights).toEqual({ category: 2 })
    expect(request.accessFilter).toBeUndefined()
  })

  it("drops a filled aspect when its weight clamps to 0", () => {
    const request = buildSparseSearchRequest({
      k: 5,
      aspects: [
        { name: "title", type: "text", value: "rake", weight: 0 },
        { name: "price", type: "number", value: "20", weight: 3 },
      ],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: true,
      withVectors: false,
      withExplanation: false,
    })

    expect(request.query).toEqual({ price: 20 })
    expect(request.weights).toEqual({ price: 3 })
  })

  it("coerces number and raw aspect values by type", () => {
    const request = buildSparseSearchRequest({
      k: 3,
      aspects: [
        { name: "price", type: "number", value: "12.5", weight: 1 },
        {
          name: "embedding",
          type: "raw",
          value: "[0.1, 0.2]",
          weight: 1,
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
    expect(request.weights).toBeUndefined()
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

  it("rejects out-of-range aspect values", () => {
    const result = searchFormSchema(schema).safeParse({
      k: "5",
      aspects: [
        { name: "price", type: "number", value: "250", weight: 1 },
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
