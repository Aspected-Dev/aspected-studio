import { describe, expect, it } from "vitest"
import { usedExplanation } from "./explanation.ts"

describe("usedExplanation", () => {
  it("keeps only entries that have a distance", () => {
    expect(usedExplanation([
      { name: "title", value: "laptop", distance: 0.2 },
      { name: "brand", value: "aurora" },
      { name: "price", value: 900, distance: 0.1 },
    ])).toEqual([
      { name: "title", value: "laptop", distance: 0.2 },
      { name: "price", value: 900, distance: 0.1 },
    ])
  })

  it("returns an empty array when nothing contributed", () => {
    expect(usedExplanation([{ name: "brand", value: "aurora" }])).toEqual([])
    expect(usedExplanation(undefined)).toEqual([])
  })
})
