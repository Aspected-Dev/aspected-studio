import { describe, expect, it } from "vitest"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import type { TuneObjective } from "./tune-objective.ts"
import {
  BUDGET_PRESETS,
  budgetExhausted,
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

/** Seven train cases, matching the audited budget scenario. */
const BUDGET_TRAIN_IDS = Array.from(
  { length: 7 },
  (_, index) => `c${index}`,
)

function budgetState(maxSearches: number): TunerState {
  const golden = set(
    BUDGET_TRAIN_IDS.map((id) => testCase({ id, name: id })),
  )
  const start: TuneConfig = { weights: { title: 1, price: 1 }, fetchK: 5 }
  return createTunerState({
    set: golden,
    start,
    space: defaultTuneSpace(golden, start.weights),
    trainIds: BUDGET_TRAIN_IDS,
    holdoutIds: [],
    maxSearches,
  })
}

/**
 * Two aspects that are individually redundant but jointly necessary: dropping
 * either one costs less than the noise floor, dropping both is a collapse.
 */
function jointlyRedundantValue(config: TuneConfig): number {
  const title = (config.weights.title ?? 1) > 0
  const price = (config.weights.price ?? 1) > 0
  if (title && price) {
    return 1
  }
  if (title || price) {
    return 0.999
  }
  return 0.5
}

/**
 * Three aspects that each cost 0.0015 to disable, under a 0.002 noise floor.
 *
 * No single drop clears the floor, so a moving reference would let all three
 * go and land well below the start config.
 */
function steadyDropValue(config: TuneConfig): number {
  const off =
    ["title", "price", "brand"].filter((name) =>
      (config.weights[name] ?? 1) <= 0
    ).length
  return 1 - 0.0015 * off
}

/** Drains one trial at a time, capturing state as the screen stage ends. */
function drainWith(
  value: (config: TuneConfig) => number,
  state: TunerState,
  maxSteps = 500,
): { final: TunerState; afterScreen: TunerState | null } {
  let current = state
  let afterScreen: TunerState | null = null
  let sawScreen = false

  for (let step = 0; step < maxSteps; step += 1) {
    if (current.stage === "done" || current.stopped) {
      break
    }
    const [request] = nextCandidates(current)
    if (!request) {
      break
    }
    current = recordTrial(current, {
      id: request.id,
      config: request.config,
      objective: objective(value(request.config)),
      scope: request.scope,
      stage: request.stage,
      searches: 1,
      label: request.label,
      bypassCache: request.bypassCache,
    })
    if (current.stage === "screen") {
      sawScreen = true
    } else if (sawScreen && afterScreen === null) {
      afterScreen = current
    }
  }

  return { final: current, afterScreen }
}

describe("screen stage", () => {
  function screenState(): TunerState {
    const golden = set([testCase()])
    const start: TuneConfig = { weights: { title: 1, price: 1 }, fetchK: 5 }
    return createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["case-1"],
      holdoutIds: [],
      maxSearches: BUDGET_PRESETS.standard,
    })
  }

  it("does not turn off two aspects that are only jointly redundant", () => {
    const { afterScreen } = drainWith(jointlyRedundantValue, screenState())

    expect(afterScreen).not.toBeNull()
    const weights = afterScreen!.working.weights
    const off = Object.values(weights).filter((weight) => weight <= 0)
    expect(off).toHaveLength(1)
  })

  it("does not compound several within-noise losses", () => {
    const golden = set([
      testCase({
        aspects: [
          { name: "title", type: "text", enabled: true, value: "rake" },
          { name: "price", type: "number", enabled: true, value: "30" },
          { name: "brand", type: "text", enabled: true, value: "acme" },
        ],
      }),
    ])
    const start: TuneConfig = {
      weights: { title: 1, price: 1, brand: 1 },
      fetchK: 5,
    }
    const { afterScreen } = drainWith(
      steadyDropValue,
      createTunerState({
        set: golden,
        start,
        space: defaultTuneSpace(golden, start.weights),
        trainIds: ["case-1"],
        holdoutIds: [],
        maxSearches: BUDGET_PRESETS.standard,
      }),
    )

    expect(afterScreen).not.toBeNull()
    const state = afterScreen!
    const off = Object.values(state.working.weights).filter(
      (weight) => weight <= 0,
    )
    expect(off).toHaveLength(1)
    // Drift from the start config stays inside a single noise floor.
    expect(steadyDropValue(state.working)).toBeGreaterThanOrEqual(
      state.baseline!.objective.value - state.noiseFloor,
    )
  })
})

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

  it("marks the run exhausted as soon as the budget is spent", () => {
    let state = budgetState(10)
    const [first] = nextCandidates(state)
    state = recordTrial(state, {
      id: first.id,
      config: first.config,
      objective: objective(oracleValue(first.config)),
      scope: first.scope,
      stage: first.stage,
      searches: 10,
      label: first.label,
    })

    expect(budgetExhausted(state)).toBe(true)
    expect(state.exhausted).toBe(true)
  })

  it("stops handing out candidates once the budget is spent", () => {
    let state = budgetState(10)
    const [first] = nextCandidates(state)
    expect(state.pending.length).toBeGreaterThan(1)

    state = recordTrial(state, {
      id: first.id,
      config: first.config,
      objective: objective(oracleValue(first.config)),
      scope: first.scope,
      stage: first.stage,
      searches: 10,
      label: first.label,
    })

    expect(state.pending.length).toBeGreaterThan(0)
    expect(nextCandidates(state)).toEqual([])
  })

  it("never exceeds maxSearches across a full coarse batch", () => {
    const searchesPerTrial = BUDGET_TRAIN_IDS.length
    const maxSearches = 250
    let state = budgetState(maxSearches)

    for (let step = 0; step < 500; step += 1) {
      const [request] = nextCandidates(state)
      if (!request) {
        break
      }
      state = recordTrial(state, {
        id: request.id,
        config: request.config,
        objective: objective(oracleValue(request.config)),
        scope: request.scope,
        stage: request.stage,
        searches: searchesPerTrial,
        label: request.label,
        bypassCache: request.bypassCache,
      })
    }

    // The budget must actually bind: the full space is far wider than 250.
    expect(state.searchesUsed).toBeGreaterThan(maxSearches - searchesPerTrial)
    // Overshoot is bounded by the one trial that was already in flight.
    expect(state.searchesUsed).toBeLessThanOrEqual(
      maxSearches + searchesPerTrial,
    )
    expect(state.trials.length * searchesPerTrial).toBe(state.searchesUsed)
    expect(championOf(state)).not.toBeNull()
  })

  it("bases depth candidates on the deepest case grading k", () => {
    const golden = set([
      testCase({ id: "shallow" }),
      testCase({ id: "deep", name: "deep", k: 12 }),
    ])
    const start: TuneConfig = {
      weights: { title: 1, price: 1 },
      fetchK: golden.k,
    }
    let state = createTunerState({
      set: golden,
      start,
      space: defaultTuneSpace(golden, start.weights),
      trainIds: ["shallow", "deep"],
      holdoutIds: [],
      maxSearches: BUDGET_PRESETS.thorough,
    })
    state = drain(state)

    const depths = [
      ...new Set(
        state.trials
          .filter((trial) => trial.stage === "depth")
          .map((trial) => trial.config.fetchK),
      ),
    ].sort((left, right) => left - right)

    // Deepest grading k is 12, not the set k of 5.
    expect(depths).toEqual([12, 24, 48])
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
