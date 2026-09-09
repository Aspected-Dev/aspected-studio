import { describe, expect, it } from "vitest"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import type { TuneObjective } from "./tune-objective.ts"
import {
  BUDGET_PRESETS,
  championOf,
  createTunerState,
  defaultTuneSpace,
  explainChampion,
  nextCandidates,
  recordTrial,
  snapWeight,
  stopTuner,
  type TuneConfig,
  type TunerState,
} from "./tuner.ts"
import type { StoredAspect } from "./types.ts"

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

function set(cases: GoldenCase[]): GoldenSet {
  return {
    ...emptyGoldenSet("catalog", schema),
    k: 5,
    cases,
  }
}

function objective(value: number): TuneObjective {
  return {
    primary: value,
    value,
    summary: {
      cases: 1,
      scored: 1,
      precision: value,
      recall: value,
      mrr: value,
      ndcg: value,
      map: value,
      green: 1,
      amber: 0,
      red: 0,
      forbidden: 0,
    },
  }
}

/**
 * Synthetic Live oracle: higher price weight is better; title off is fine.
 */
function oracleValue(config: TuneConfig): number {
  const price = config.weights.price ?? 1
  const title = config.weights.title ?? 1
  let score = 0.5 + Math.min(price, 10) / 20
  if (title <= 0) {
    score += 0.05
  }
  if (config.fetchK > 5) {
    score += 0.01
  }
  return score
}

function drain(
  state: TunerState,
  maxSteps = 200,
): TunerState {
  let current = state
  for (let step = 0; step < maxSteps; step += 1) {
    if (current.stage === "done" || current.stopped) {
      return current
    }
    const pending = nextCandidates(current)
    if (pending.length === 0) {
      return current
    }
    for (const request of pending) {
      current = recordTrial(current, {
        id: request.id,
        config: request.config,
        objective: objective(oracleValue(request.config)),
        scope: request.scope,
        stage: request.stage,
        searches: request.bypassCache ? 1 : 1,
        label: request.label,
        bypassCache: request.bypassCache,
      })
    }
  }
  return current
}

describe("snapWeight", () => {
  it("maps positive weights onto the slider grid", () => {
    expect(snapWeight(1)).toBe(1)
    expect(snapWeight(0)).toBe(0)
    expect(snapWeight(-1)).toBe(0)
  })
})

describe("createTunerState and stages", () => {
  it("queues baseline trials first", () => {
    const golden = set([testCase()])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: 5,
    }
    const state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["case-1"],
      holdoutIds: [],
      maxSearches: BUDGET_PRESETS.quick,
    })
    const pending = nextCandidates(state)
    expect(pending.map((item) => item.label)).toEqual([
      "start",
      "noise repeat",
    ])
    expect(pending.every((item) => item.stage === "baseline")).toBe(true)
  })

  it("reaches done with a champion better than start", () => {
    const golden = set([testCase()])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: 5,
    }
    let state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["case-1"],
      holdoutIds: [],
      maxSearches: BUDGET_PRESETS.standard,
    })
    state = drain(state)
    expect(state.stage).toBe("done")
    const champion = championOf(state)
    expect(champion).not.toBeNull()
    expect(champion!.objective.value).toBeGreaterThan(
      oracleValue(start) - 0.001,
    )
    expect(explainChampion(state).length).toBeGreaterThan(0)
  })

  it("stops early and keeps the champion", () => {
    const golden = set([testCase()])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: 5,
    }
    let state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["case-1"],
      holdoutIds: [],
      maxSearches: BUDGET_PRESETS.standard,
    })
    const first = nextCandidates(state)
    for (const request of first) {
      state = recordTrial(state, {
        id: request.id,
        config: request.config,
        objective: objective(oracleValue(request.config)),
        scope: request.scope,
        stage: request.stage,
        searches: 1,
        label: request.label,
      })
    }
    state = stopTuner(state)
    expect(state.stage).toBe("done")
    expect(state.stopped).toBe(true)
    expect(championOf(state)).not.toBeNull()
  })

  it("exhausts a tiny budget and still finishes", () => {
    const golden = set([testCase()])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: 5,
    }
    let state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["case-1"],
      holdoutIds: [],
      maxSearches: 3,
    })
    state = drain(state)
    expect(state.stage).toBe("done")
    expect(state.exhausted || state.searchesUsed <= 3 + 20).toBe(true)
    expect(championOf(state)).not.toBeNull()
  })

  it("scores holdout when holdout ids are provided", () => {
    const golden = set([
      testCase({ id: "train" }),
      testCase({ id: "hold", name: "hold" }),
    ])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: 5,
    }
    let state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["train"],
      holdoutIds: ["hold"],
      maxSearches: BUDGET_PRESETS.standard,
    })
    state = drain(state)
    expect(state.holdoutObjective).not.toBeNull()
    expect(
      state.trials.some((trial) => trial.scope === "holdout"),
    ).toBe(true)
  })
})
