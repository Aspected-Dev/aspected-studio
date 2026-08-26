import { describe, expect, it } from "vitest"
import {
  activeAspects,
  activeWeights,
  aspectRowsFromSchema,
  buildPlaygroundRequest,
  clampWeight,
  coerceAspectValue,
  MAX_WEIGHT,
  type PlaygroundFormValues,
  scoringWeights,
  sliderToWeight,
  weightToSlider,
} from "./playground.ts"
import type { StoredAspect } from "./types.ts"

/** Builds form values with sensible defaults for the fields under test. */
function values(
  aspects: PlaygroundFormValues["aspects"],
  k = "10",
): PlaygroundFormValues {
  return { k, autoRun: true, aspects }
}

describe("weightToSlider", () => {
  it("puts a weight of 1 at the midpoint", () => {
    expect(weightToSlider(1)).toBe(50)
  })

  it("spans two decades either side of the midpoint", () => {
    expect(weightToSlider(0.01)).toBe(0)
    expect(weightToSlider(0.1)).toBe(25)
    expect(weightToSlider(10)).toBe(75)
    expect(weightToSlider(100)).toBe(100)
  })

  it("clamps out-of-range and invalid weights", () => {
    expect(weightToSlider(0)).toBe(0)
    expect(weightToSlider(-5)).toBe(0)
    expect(weightToSlider(1000)).toBe(100)
    expect(weightToSlider(Number.NaN)).toBe(0)
  })
})

describe("sliderToWeight", () => {
  it("mirrors weightToSlider at the decade boundaries", () => {
    expect(sliderToWeight(0)).toBeCloseTo(0.01, 10)
    expect(sliderToWeight(25)).toBeCloseTo(0.1, 10)
    expect(sliderToWeight(50)).toBeCloseTo(1, 10)
    expect(sliderToWeight(75)).toBeCloseTo(10, 10)
    expect(sliderToWeight(100)).toBeCloseTo(100, 10)
  })

  it("round-trips through weightToSlider", () => {
    for (const weight of [0.01, 0.1, 1, 10, 100]) {
      expect(sliderToWeight(weightToSlider(weight))).toBeCloseTo(weight, 6)
    }
  })

  it("clamps positions outside the track", () => {
    expect(sliderToWeight(-10)).toBeCloseTo(0.01, 10)
    expect(sliderToWeight(500)).toBeCloseTo(100, 10)
  })
})

describe("clampWeight", () => {
  it("keeps weights inside the server range", () => {
    expect(clampWeight(2.5)).toBe(2.5)
    expect(clampWeight(MAX_WEIGHT + 1)).toBe(MAX_WEIGHT)
  })

  it("collapses sub-minimum weights to zero, matching the server", () => {
    expect(clampWeight(0.00001)).toBe(0)
    expect(clampWeight(0)).toBe(0)
    expect(clampWeight(-1)).toBe(0)
    expect(clampWeight(Number.NaN)).toBe(0)
  })
})

describe("coerceAspectValue", () => {
  it("parses numbers for number aspects", () => {
    expect(coerceAspectValue("number", " 12.5 ")).toBe(12.5)
  })

  it("rejects non-numeric number aspects", () => {
    expect(() => coerceAspectValue("number", "abc")).toThrow(SyntaxError)
  })

  it("wraps raw aspects in the $raw envelope", () => {
    expect(coerceAspectValue("raw", "[0.1, 0.2]")).toEqual({
      $raw: [0.1, 0.2],
    })
  })

  it("rejects raw aspects that are not number arrays", () => {
    expect(() => coerceAspectValue("raw", '["a"]')).toThrow(SyntaxError)
    expect(() => coerceAspectValue("raw", "{}")).toThrow(SyntaxError)
  })

  it("trims everything else into a string", () => {
    expect(coerceAspectValue("text", "  hello  ")).toBe("hello")
    expect(coerceAspectValue("enum", "signed")).toBe("signed")
    expect(coerceAspectValue("datetime", "2023-04-01")).toBe("2023-04-01")
  })
})

describe("activeAspects", () => {
  it("keeps only enabled aspects with a value and a usable weight", () => {
    const active = activeAspects(values([
      { name: "keep", type: "text", enabled: true, value: "x", weight: 1 },
      { name: "off", type: "text", enabled: false, value: "x", weight: 1 },
      { name: "blank", type: "text", enabled: true, value: "  ", weight: 1 },
      { name: "zero", type: "text", enabled: true, value: "x", weight: 0 },
    ]))

    expect(active.map((aspect) => aspect.name)).toEqual(["keep"])
  })
})

describe("activeWeights", () => {
  it("clamps the weights it reports", () => {
    expect(activeWeights(values([
      { name: "big", type: "text", enabled: true, value: "x", weight: 99999 },
      { name: "ok", type: "text", enabled: true, value: "x", weight: 2 },
    ]))).toEqual({ big: MAX_WEIGHT, ok: 2 })
  })
})

describe("scoringWeights", () => {
  it("pins aspects that are not being queried to zero", () => {
    expect(scoringWeights(values([
      { name: "asked", type: "text", enabled: true, value: "x", weight: 3 },
      { name: "off", type: "text", enabled: false, value: "x", weight: 3 },
      { name: "blank", type: "text", enabled: true, value: "", weight: 3 },
    ]))).toEqual({ asked: 3, off: 0, blank: 0 })
  })
})

describe("buildPlaygroundRequest", () => {
  it("builds a sparse query with weights and explanation enabled", () => {
    const request = buildPlaygroundRequest(values([
      { name: "title", type: "text", enabled: true, value: "rake", weight: 3 },
      {
        name: "price",
        type: "number",
        enabled: true,
        value: "20",
        weight: 0.5,
      },
      { name: "colour", type: "enum", enabled: false, value: "red", weight: 1 },
    ], "25"))

    expect(request).toEqual({
      k: 25,
      query: { title: "rake", price: 20 },
      weights: { title: 3, price: 0.5 },
      withDocs: true,
      withExplanation: true,
    })
  })

  it("omits weights entirely when nothing is active", () => {
    const request = buildPlaygroundRequest(values([
      { name: "title", type: "text", enabled: false, value: "x", weight: 1 },
    ]))

    expect(request.query).toEqual({})
    expect(request.weights).toBeUndefined()
  })

  it("propagates coercion failures", () => {
    expect(() =>
      buildPlaygroundRequest(values([
        { name: "vec", type: "raw", enabled: true, value: "nope", weight: 1 },
      ]))
    ).toThrow()
  })
})

describe("aspectRowsFromSchema", () => {
  it("enables every aspect at weight 1 with no value", () => {
    const schema: StoredAspect[] = [
      { name: "title", type: "text", path: "$.title", settings: {} },
      { name: "year", type: "number", path: "$.year", settings: {} },
    ]

    expect(aspectRowsFromSchema(schema)).toEqual([
      { name: "title", type: "text", enabled: true, value: "", weight: 1 },
      { name: "year", type: "number", enabled: true, value: "", weight: 1 },
    ])
  })
})
