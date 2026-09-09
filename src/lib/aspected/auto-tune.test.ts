import { describe, expect, it } from "vitest"
import {
  pickSweepPeak,
  previewSetNdcg,
  rankVsWeightIds,
  suggestWeights,
  sweepAspectNdcg,
  type SweepPoint,
  sweepRankVsWeight,
  tunableAspectNames,
} from "./auto-tune.ts"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import type { CaseRun } from "./scorecard.ts"
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
    expected: [{ id: "b", gain: 1 }],
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
    k: 3,
    cases,
    ...overrides,
  }
}

function rows(): SearchResultRow[] {
  return [
    {
      id: "a",
      distance: 1.1,
      explanation: [
        { name: "title", distance: 0.1 },
        { name: "price", distance: 1 },
      ],
    },
    {
      id: "x",
      distance: 1.2,
      explanation: [
        { name: "title", distance: 0.6 },
        { name: "price", distance: 0.6 },
      ],
    },
    {
      id: "b",
      distance: 1.3,
      explanation: [
        { name: "title", distance: 1.2 },
        { name: "price", distance: 0.1 },
      ],
    },
  ] as SearchResultRow[]
}

function run(overrides: Partial<CaseRun> = {}): CaseRun {
  return {
    caseId: "case-1",
    rows: rows(),
    weightsUsed: { title: 1, price: 1 },
    request: { k: 3, query: {} },
    signature: "sig",
    error: null,
    ...overrides,
  }
}

describe("pickSweepPeak", () => {
  it("returns null for an empty curve", () => {
    expect(pickSweepPeak([])).toBeNull()
  })

  it("marks a clear interior maximum as interior", () => {
    const points: SweepPoint[] = [
      { weight: 0.01, ndcg: 0.5 },
      { weight: 0.1, ndcg: 0.6 },
      { weight: 1, ndcg: 0.9 },
      { weight: 10, ndcg: 0.7 },
      { weight: 100, ndcg: 0.4 },
    ]
    const peak = pickSweepPeak(points)
    expect(peak).toEqual({
      weight: 1,
      ndcg: 0.9,
      kind: "interior",
      index: 2,
    })
  })

  it("prefers an interior peak within epsilon of an edge max", () => {
    const points: SweepPoint[] = [
      { weight: 0.01, ndcg: 0.901 },
      { weight: 0.1, ndcg: 0.7 },
      { weight: 1, ndcg: 0.9 },
      { weight: 10, ndcg: 0.6 },
      { weight: 100, ndcg: 0.4 },
    ]
    const peak = pickSweepPeak(points, 0.002)
    expect(peak?.kind).toBe("interior")
    expect(peak?.weight).toBe(1)
  })

  it("keeps a true edge peak when the interior is far worse", () => {
    const points: SweepPoint[] = [
      { weight: 0.01, ndcg: 1 },
      { weight: 0.1, ndcg: 0.5 },
      { weight: 1, ndcg: 0.4 },
      { weight: 10, ndcg: 0.3 },
      { weight: 100, ndcg: 0.2 },
    ]
    const peak = pickSweepPeak(points)
    expect(peak).toMatchObject({
      weight: 0.01,
      ndcg: 1,
      kind: "edge",
      index: 0,
    })
  })
})

describe("sweepAspectNdcg and suggestWeights", () => {
  const golden = set([testCase()])
  const runs = new Map([["case-1", run()]])
  const start = { title: 1, price: 1 }

  it("sweeps price and finds a peak that promotes the price match", () => {
    const points = sweepAspectNdcg(
      golden,
      runs,
      "Euclidean",
      start,
      schema,
      "price",
    )
    expect(points.length).toBeGreaterThan(5)
    const peak = pickSweepPeak(points)
    expect(peak).not.toBeNull()
    const atStart = previewSetNdcg(golden, runs, "Euclidean", start, schema)
    const atPeak = previewSetNdcg(
      golden,
      runs,
      "Euclidean",
      { ...start, price: peak!.weight },
      schema,
    )
    expect(atPeak).toBeGreaterThanOrEqual(atStart)
  })

  it("lists tunable aspects from runnable cases only", () => {
    expect(tunableAspectNames(golden, start)).toEqual(["title", "price"])
  })

  it("raises Preview nDCG from equal weights via coordinate ascent", () => {
    const result = suggestWeights({
      set: golden,
      runs,
      metric: "Euclidean",
      schema,
      startWeights: start,
      rounds: 2,
    })
    expect(result.previewNdcg).toBeGreaterThanOrEqual(result.startNdcg)
    expect(result.history.length).toBeGreaterThan(0)
  })
})

describe("rankVsWeightIds and sweepRankVsWeight", () => {
  it("caps expected ids then appends forbidden", () => {
    expect(rankVsWeightIds(["a", "b", "c"], ["bad"], 2)).toEqual([
      "a",
      "b",
      "bad",
    ])
  })

  it("emits rank series for tracked ids across a sweep", () => {
    const golden = set([testCase()])
    const runs = new Map([["case-1", run()]])
    const series = sweepRankVsWeight(
      golden,
      runs,
      "Euclidean",
      { title: 1, price: 1 },
      schema,
      "price",
      "case-1",
      ["b", "a"],
    )
    expect(series.length).toBeGreaterThan(5)
    expect(series[0]).toHaveProperty("weight")
    expect(series[0]).toHaveProperty("b")
    expect(series[0]).toHaveProperty("a")
  })
})
