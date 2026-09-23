import { describe, expect, it } from "vitest"
import {
  type AutoTuneSetupValues,
  setupValuesForSet,
} from "./auto-tune-setup.tsx"
import { GOLDEN_SET_VERSION, type GoldenSet } from "@/lib/aspected/golden.ts"
import { defaultTuneSpace } from "@/lib/aspected/tuner.ts"

const startWeights = {
  title: 1,
  released: 1,
  rating: 1,
}

function set(
  id: string,
  name: string,
  aspects: GoldenSet["cases"][number]["aspects"],
): GoldenSet {
  return {
    version: GOLDEN_SET_VERSION,
    id,
    name,
    indexName: "movies",
    k: 10,
    thresholds: { metric: "ndcg", green: 0.8, amber: 0.5 },
    cases: [{
      id: `${id}-case`,
      name: "case",
      aspects,
      expected: [{ id: "doc-1", gain: 1 }],
      forbidden: [],
      k: null,
      notes: "",
      tags: [],
      enabled: true,
    }],
    updatedAt: 1,
  }
}

const planted = set("planted", "Movies planted truth", [
  { name: "title", type: "text", enabled: true, value: "knight" },
  { name: "released", type: "datetime", enabled: false, value: "" },
  { name: "rating", type: "number", enabled: true, value: "8" },
])

const baseline = set("baseline", "Movies baseline", [
  { name: "title", type: "text", enabled: true, value: "batman" },
  { name: "released", type: "datetime", enabled: true, value: "1989" },
  { name: "rating", type: "number", enabled: false, value: "" },
])

const baseValues: AutoTuneSetupValues = {
  setId: planted.id,
  space: defaultTuneSpace(planted, startWeights),
  budgetPreset: "standard",
  customBudget: 1000,
  concurrency: 4,
  useHoldout: false,
  tuneDepth: true,
  wallClockMinutes: null,
}

describe("setupValuesForSet", () => {
  it("rebuilds freeze flags from the newly selected set", () => {
    expect(
      baseValues.space.aspects.find((aspect) => aspect.name === "released")
        ?.freeze,
    ).toBe(true)

    const next = setupValuesForSet(
      baseValues,
      [planted, baseline],
      baseline.id,
      startWeights,
    )

    expect(next.setId).toBe(baseline.id)
    expect(
      next.space.aspects.find((aspect) => aspect.name === "released")?.freeze,
    ).toBe(false)
    expect(
      next.space.aspects.find((aspect) => aspect.name === "released")
        ?.tuneWeight,
    ).toBe(true)
    expect(
      next.space.aspects.find((aspect) => aspect.name === "rating")?.freeze,
    ).toBe(true)
    expect(next.tuneDepth).toBe(true)
    expect(next.budgetPreset).toBe("standard")
  })

  it("keeps holdout off when the next set is too small for a split", () => {
    const next = setupValuesForSet(
      { ...baseValues, useHoldout: true },
      [planted, baseline],
      planted.id,
      startWeights,
    )
    expect(next.useHoldout).toBe(false)
  })
})
