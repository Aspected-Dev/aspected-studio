import { describe, expect, it } from "vitest"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import type { CaseRun } from "./scorecard.ts"
import {
  caseDeltas,
  casePrimaries,
  enabledAspectCount,
  isBetterConfig,
  liveObjective,
  measuredNoiseFloor,
  noiseLabel,
  splitHoldout,
  splitRunnableHoldout,
  trialCases,
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

  it("does not reward a trial whose hardest case errored", () => {
    const golden = set([
      testCase({ id: "easy", expected: [{ id: "a", gain: 1 }] }),
      testCase({
        id: "hard",
        name: "hard",
        expected: [{ id: "z", gain: 1 }],
      }),
    ])
    const scope = new Set(["easy", "hard"])
    const healthy = new Map([
      ["easy", run("easy", [{ id: "a", distance: 0.1 }])],
      ["hard", run("hard", [{ id: "q", distance: 0.1 }])],
    ])
    const errored = new Map([
      ["easy", run("easy", [{ id: "a", distance: 0.1 }])],
      ["hard", { ...run("hard", []), error: "Case failed" }],
    ])

    const good = liveObjective(golden, healthy, scope)
    const broken = liveObjective(golden, errored, scope)

    expect(good.summary.cases).toBe(2)
    expect(good.primary).toBeCloseTo(0.5)
    expect(broken.summary.cases).toBe(2)
    expect(broken.primary).toBeCloseTo(0.5)
    expect(broken.value).toBeLessThanOrEqual(good.value)
  })

  it("scores a case with no run as zero rather than dropping it", () => {
    const golden = set([
      testCase({ id: "ran", expected: [{ id: "a", gain: 1 }] }),
      testCase({
        id: "never-ran",
        name: "never ran",
        expected: [{ id: "a", gain: 1 }],
      }),
    ])
    const runs = new Map([
      ["ran", run("ran", [{ id: "a", distance: 0.1 }])],
    ])

    const objective = liveObjective(golden, runs, new Set(["ran", "never-ran"]))
    expect(objective.summary.cases).toBe(2)
    expect(objective.primary).toBeCloseTo(0.5)
  })
})

describe("trialCases", () => {
  const weights = { title: 1, price: 1 }

  it("never fetches shallower than the case grading k", () => {
    const golden = set([
      testCase({ id: "shallow" }),
      testCase({ id: "deep", name: "deep", k: 50 }),
    ], { k: 20 })

    expect(
      trialCases(golden, weights, ["shallow", "deep"], 20).map((entry) => [
        entry.item.id,
        entry.fetchK,
      ]),
    ).toEqual([["shallow", 20], ["deep", 50]])
  })

  it("keeps a fetchK that is already deeper than the grading k", () => {
    const golden = set([testCase({ id: "deep", k: 50 })], { k: 20 })

    expect(trialCases(golden, weights, ["deep"], 80)[0].fetchK).toBe(80)
  })

  it("skips cases with no active aspects instead of searching an empty query", () => {
    const golden = set([
      testCase({ id: "queryable" }),
      testCase({
        id: "brand-only",
        name: "brand only",
        aspects: [
          { name: "brand", type: "text", enabled: true, value: "acme" },
        ],
      }),
    ])

    expect(
      trialCases(golden, { ...weights, brand: 0 }, [
        "queryable",
        "brand-only",
      ], 20).map((entry) => entry.item.id),
    ).toEqual(["queryable"])
  })

  it("keeps only cases in scope", () => {
    const golden = set([
      testCase({ id: "train" }),
      testCase({ id: "hold", name: "hold" }),
    ])

    expect(
      trialCases(golden, weights, ["hold"], 20).map((entry) => entry.item.id),
    ).toEqual(["hold"])
  })
})

describe("caseDeltas", () => {
  const golden = set([
    testCase({ id: "train", expected: [{ id: "a", gain: 1 }] }),
    testCase({ id: "hold", name: "hold", expected: [{ id: "a", gain: 1 }] }),
  ])
  const baseline = new Map([
    ["train", run("train", [{ id: "x", distance: 0.1 }])],
  ])

  it("computes case deltas against the champion runs, not the last trial", () => {
    const championRuns = new Map([
      ["train", run("train", [{ id: "a", distance: 0.1 }])],
    ])

    const deltas = caseDeltas(golden, baseline, championRuns)

    expect(deltas).toHaveLength(1)
    expect(deltas[0].caseId).toBe("train")
    expect(deltas[0].baseline).toBeCloseTo(0)
    expect(deltas[0].primary).toBeCloseTo(1)
    expect(deltas[0].delta).toBeCloseTo(1)
  })

  it("returns nothing when the compared runs are a disjoint holdout scope", () => {
    const holdoutRuns = new Map([
      ["hold", run("hold", [{ id: "a", distance: 0.1 }])],
    ])

    expect(caseDeltas(golden, baseline, holdoutRuns)).toEqual([])
  })
})

describe("splitRunnableHoldout", () => {
  it("splits only runnable cases", () => {
    const runnable = Array.from(
      { length: 9 },
      (_, index) => testCase({ id: `r${index}`, name: `r${index}` }),
    )
    const blank = Array.from({ length: 3 }, (_, index) =>
      testCase({
        id: `blank${index}`,
        name: `blank${index}`,
        aspects: [
          { name: "title", type: "text", enabled: true, value: "" },
        ],
      }))
    const golden = set([...runnable, ...blank])

    const split = splitRunnableHoldout(golden, { title: 1, price: 1 }, 42)

    expect(split).not.toBeNull()
    const all = [...split!.trainIds, ...split!.holdoutIds]
    expect(all).toHaveLength(9)
    expect(all.some((id) => id.startsWith("blank"))).toBe(false)
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
