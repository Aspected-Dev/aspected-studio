import { describe, expect, it } from "vitest"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import type { CaseRun } from "./scorecard.ts"
import {
  casePrimaries,
  enabledAspectCount,
  isBetterConfig,
  liveObjective,
  measuredNoiseFloor,
  noiseLabel,
  splitHoldout,
  weightDistance,
} from "./tune-objective.ts"
import type { SearchResultRow, StoredAspect } from "./types.ts"

const schema = [
  { name: "title", type: "text" },
  { name: "price", type: "number" },
] as StoredAspect[]

function testCase(overrides: Partial<GoldenCase> = {}): GoldenCase {
  return {
    id: "case-1",
    name: "rakes",
    aspects: [
      { name: "title", type: "text", enabled: true, value: "rake" },
      { name: "price", type: "number", enabled: true, value: "30" },
    ],
    expected: [{ id: "a", gain: 1 }],
    forbidden: [],
    k: null,
    notes: "",
    tags: [],
    enabled: true,
    ...overrides,
  }
}

function set(
  cases: GoldenCase[],
  overrides: Partial<GoldenSet> = {},
): GoldenSet {
  return {
    ...emptyGoldenSet("catalog", schema),
    k: 2,
    cases,
    ...overrides,
  }
}

function run(
  caseId: string,
  rows: SearchResultRow[],
): CaseRun {
  return {
    caseId,
    rows,
    weightsUsed: { title: 1, price: 1 },
    request: { k: 2, query: { title: "rake" } },
    signature: caseId,
    error: null,
  }
}

describe("liveObjective", () => {
  it("penalizes forbidden hits in the objective value", () => {
    const golden = set([
      testCase({
        id: "ok",
        expected: [{ id: "a", gain: 1 }],
        forbidden: [],
      }),
      testCase({
        id: "bad",
        name: "bad",
        expected: [{ id: "a", gain: 1 }],
        forbidden: ["banned"],
      }),
    ])
    const runs = new Map([
      ["ok", run("ok", [{ id: "a", distance: 0.1 }])],
      [
        "bad",
        run("bad", [
          { id: "a", distance: 0.1 },
          { id: "banned", distance: 0.2 },
        ]),
      ],
    ])

    const objective = liveObjective(golden, runs)
    expect(objective.primary).toBeCloseTo(1)
    expect(objective.summary.forbidden).toBe(1)
    expect(objective.value).toBeCloseTo(1 - 0.2 * 0.5)
  })

  it("scopes to a case id subset for holdout", () => {
    const golden = set([
      testCase({ id: "train", expected: [{ id: "a", gain: 1 }] }),
      testCase({
        id: "hold",
        name: "hold",
        expected: [{ id: "a", gain: 1 }],
      }),
    ])
    const runs = new Map([
      ["train", run("train", [{ id: "a", distance: 0.1 }])],
      ["hold", run("hold", [{ id: "x", distance: 0.1 }])],
    ])

    const train = liveObjective(golden, runs, new Set(["train"]))
    expect(train.primary).toBeCloseTo(1)
    expect(train.summary.cases).toBe(1)
  })
})

describe("isBetterConfig", () => {
  const start = { weights: { title: 1, price: 1 }, fetchK: 10 }

  it("prefers a clear objective gain", () => {
    expect(
      isBetterConfig(
        { value: 0.9, weights: { title: 2, price: 1 }, fetchK: 10 },
        { value: 0.8, weights: { title: 1, price: 1 }, fetchK: 10 },
        start,
        0.002,
      ),
    ).toBe(true)
  })

  it("prefers fewer enabled aspects inside the noise band", () => {
    expect(
      isBetterConfig(
        { value: 0.801, weights: { title: 1, price: 0 }, fetchK: 10 },
        { value: 0.8, weights: { title: 1, price: 1 }, fetchK: 10 },
        start,
        0.002,
      ),
    ).toBe(true)
  })

  it("prefers smaller fetchK when enabled counts match", () => {
    expect(
      isBetterConfig(
        { value: 0.8, weights: { title: 1, price: 1 }, fetchK: 10 },
        { value: 0.8, weights: { title: 1, price: 1 }, fetchK: 20 },
        start,
        0.002,
      ),
    ).toBe(true)
  })
})

describe("noise helpers", () => {
  it("floors measured noise", () => {
    expect(measuredNoiseFloor(0.0001)).toBe(0.002)
    expect(measuredNoiseFloor(0.01)).toBe(0.01)
  })

  it("labels small gains as noise", () => {
    expect(noiseLabel(0.001, 0.004)).toBe("noise")
    expect(noiseLabel(0.02, 0.004)).toBe("real")
  })
})

describe("weightDistance and enabledAspectCount", () => {
  it("counts positive weights", () => {
    expect(enabledAspectCount({ a: 1, b: 0, c: 2 })).toBe(2)
  })

  it("is zero for identical maps", () => {
    expect(weightDistance({ a: 1 }, { a: 1 })).toBe(0)
  })
})

describe("splitHoldout", () => {
  it("returns null for small sets", () => {
    const cases = Array.from(
      { length: 5 },
      (_, index) => testCase({ id: `c${index}`, name: `c${index}` }),
    )
    expect(splitHoldout(cases, 1)).toBeNull()
  })

  it("is deterministic for a seed", () => {
    const cases = Array.from(
      { length: 10 },
      (_, index) => testCase({ id: `c${index}`, name: `c${index}` }),
    )
    const first = splitHoldout(cases, 42)
    const second = splitHoldout(cases, 42)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first!.holdoutIds).toEqual(second!.holdoutIds)
    expect(first!.trainIds).toEqual(second!.trainIds)
    expect(first!.holdoutIds.length).toBeGreaterThanOrEqual(3)
    expect(first!.trainIds.length).toBeGreaterThanOrEqual(3)
  })

  it("changes with the seed", () => {
    const cases = Array.from(
      { length: 10 },
      (_, index) => testCase({ id: `c${index}`, name: `c${index}` }),
    )
    const a = splitHoldout(cases, 1)!
    const b = splitHoldout(cases, 99)!
    expect(a.holdoutIds.join(",")).not.toBe(b.holdoutIds.join(","))
  })
})

describe("casePrimaries", () => {
  it("lists per-case primary metrics", () => {
    const golden = set([testCase()])
    const runs = new Map([
      ["case-1", run("case-1", [{ id: "a", distance: 0.1 }])],
    ])
    expect(casePrimaries(golden, runs)).toEqual([{
      caseId: "case-1",
      name: "rakes",
      primary: 1,
      forbidden: false,
    }])
  })
})
