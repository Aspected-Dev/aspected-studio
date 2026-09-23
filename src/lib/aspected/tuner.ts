import { tunableAspectNames } from "./auto-tune.ts"
import type { GoldenSet } from "./golden.ts"
import { clampWeight, SLIDER_STEPS, sliderToWeight } from "./playground.ts"
import {
  deepestGradingK,
  enabledAspectCount,
  isBetterConfig,
  measuredNoiseFloor,
  type TuneObjective,
} from "./tune-objective.ts"

/** Coarse log grid spanning roughly 0.1 to 10. */
export const COARSE_WEIGHT_GRID = [
  0.1,
  0.2,
  0.4,
  0.7,
  1,
  1.5,
  2.5,
  5,
  10,
] as const

/** Local refine multipliers around a winner. */
export const REFINE_FACTORS = [1.5, 1.25] as const

/** Fetch depth multiples of the deepest case grading k. */
export const DEPTH_MULTIPLES = [1, 2, 4] as const

/** Budget presets counted in individual searches. */
export const BUDGET_PRESETS = {
  quick: 250,
  standard: 1000,
  thorough: 4000,
} as const

/** One aspect's search-space policy. */
export type AspectTuneSpace = {
  name: string
  /** When false, weight stays at start. */
  tuneWeight: boolean
  /** When true, weight 0 is a candidate. */
  allowOff: boolean
  /** Frozen at the start weight (implies tuneWeight false). */
  freeze: boolean
}

/** Full search space for one run. */
export type TuneSpace = {
  aspects: AspectTuneSpace[]
  /** When true, try fetchK multiples of set.k. */
  tuneDepth: boolean
}

/** Candidate config under test. */
export type TuneConfig = {
  /** Weight per aspect. 0 means off for every case query. */
  weights: Record<string, number>
  /** Documents fetched per case. Grading still uses caseK. */
  fetchK: number
}

/** Planner stage names shown in the UI stepper. */
export type TuneStage =
  | "baseline"
  | "screen"
  | "coarse"
  | "refine"
  | "depth"
  | "confirm"
  | "done"

/** One evaluated trial. */
export type TuneTrial = {
  id: number
  config: TuneConfig
  objective: TuneObjective
  /** Cases this trial scored (train unless confirm holdout). */
  scope: "train" | "holdout" | "all"
  stage: TuneStage
  /** Searches issued to evaluate this trial (cache misses). */
  searches: number
  /** Short label for the trial feed. */
  label: string
  /** Bypass signature cache for this evaluation. */
  bypassCache?: boolean
}

/** Options for creating a tuner run. */
export type TunerOptions = {
  set: GoldenSet
  start: TuneConfig
  space: TuneSpace
  trainIds: string[]
  holdoutIds: string[]
  maxSearches: number
}

/** Mutable planner state. Pure: no I/O. */
export type TunerState = {
  options: TunerOptions
  stage: TuneStage
  trials: TuneTrial[]
  pending: TuneTrialRequest[]
  nextTrialId: number
  searchesUsed: number
  noiseFloor: number
  /** Current best on the train split (or all when no holdout). */
  champion: TuneTrial | null
  /** Baseline trial (start config). */
  baseline: TuneTrial | null
  /** Ordered aspects for ascent. */
  aspectOrder: string[]
  /** Working config the ascent mutates. */
  working: TuneConfig
  /** Aspect index within the current coarse/refine sweep. */
  aspectIndex: number
  coarseRound: number
  refineRound: number
  refineFactorIndex: number
  screenIndex: number
  depthIndex: number
  confirmIndex: number
  /** Trial ids for the open aspect batch (to pick a local winner). */
  batchIds: number[]
  batchAspect: string | null
  /** Top trial ids queued for confirm re-eval. */
  confirmQueue: number[]
  /** True after near-tie holdout trials have been enqueued (or skipped). */
  holdoutQueued: boolean
  holdoutObjective: TuneObjective | null
  stopped: boolean
  exhausted: boolean
}

/** Request the evaluator should score Live. */
export type TuneTrialRequest = {
  id: number
  config: TuneConfig
  scope: "train" | "holdout" | "all"
  stage: TuneStage
  label: string
  bypassCache?: boolean
}

/**
 * Builds a default space: tune every aspect the set uses, allow off, freeze none.
 */
export function defaultTuneSpace(
  set: GoldenSet,
  startWeights: Record<string, number>,
): TuneSpace {
  const tunable = new Set(tunableAspectNames(set, startWeights))
  const names = Object.keys(startWeights)
  return {
    aspects: names.map((name) => ({
      name,
      tuneWeight: tunable.has(name),
      allowOff: tunable.has(name),
      freeze: !tunable.has(name),
    })),
    tuneDepth: true,
  }
}

/**
 * Clamps a weight onto the slider log grid (or 0 for off).
 */
export function snapWeight(weight: number): number {
  if (weight <= 0) {
    return 0
  }
  const clamped = clampWeight(weight)
  if (clamped <= 0) {
    return 0
  }
  let best = sliderToWeight(0)
  let bestDelta = Math.abs(Math.log10(best) - Math.log10(clamped))
  for (let step = 1; step <= SLIDER_STEPS; step += 1) {
    const candidate = sliderToWeight(step)
    const delta = Math.abs(Math.log10(candidate) - Math.log10(clamped))
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }
  return best
}

/**
 * Creates the initial planner state and queues baseline trials.
 */
export function createTunerState(options: TunerOptions): TunerState {
  const state: TunerState = {
    options,
    stage: "baseline",
    trials: [],
    pending: [],
    nextTrialId: 1,
    searchesUsed: 0,
    noiseFloor: measuredNoiseFloor(0),
    champion: null,
    baseline: null,
    aspectOrder: tunableNames(options.space),
    working: cloneConfig(options.start),
    aspectIndex: 0,
    coarseRound: 0,
    refineRound: 0,
    refineFactorIndex: 0,
    screenIndex: 0,
    depthIndex: 0,
    confirmIndex: 0,
    batchIds: [],
    batchAspect: null,
    confirmQueue: [],
    holdoutQueued: false,
    holdoutObjective: null,
    stopped: false,
    exhausted: false,
  }

  enqueue(state, {
    config: cloneConfig(options.start),
    scope: trainScope(options),
    stage: "baseline",
    label: "start",
  })

  const allOne = allWeightsOne(options.start)
  if (!sameConfig(allOne, options.start)) {
    enqueue(state, {
      config: allOne,
      scope: trainScope(options),
      stage: "baseline",
      label: "all weights 1",
    })
  }

  enqueue(state, {
    config: cloneConfig(options.start),
    scope: trainScope(options),
    stage: "baseline",
    label: "noise repeat",
    bypassCache: true,
  })

  return state
}

/**
 * True when the run has spent its search budget.
 *
 * Trial cost is only known once a trial has been evaluated, so the budget
 * bounds where the next trial may start rather than where the last one ends.
 * Overshoot is therefore capped at a single trial.
 */
export function budgetExhausted(state: TunerState): boolean {
  return state.searchesUsed >= state.options.maxSearches
}

/**
 * Returns the pending trial requests, newest batch last (does not clear them).
 *
 * Empty once the budget is spent, so an executor that re-reads this after each
 * trial cannot work through the rest of a batch that was queued while budget
 * still remained.
 */
export function nextCandidates(state: TunerState): TuneTrialRequest[] {
  if (budgetExhausted(state)) {
    return []
  }
  return [...state.pending]
}

/**
 * Records a finished trial and advances the stage machine when the queue is empty.
 */
export function recordTrial(
  state: TunerState,
  trial: Omit<TuneTrial, "id"> & { id?: number },
): TunerState {
  const next: TunerState = {
    ...state,
    trials: [...state.trials],
    pending: [...state.pending],
    batchIds: [...state.batchIds],
    confirmQueue: [...state.confirmQueue],
    aspectOrder: [...state.aspectOrder],
    working: cloneConfig(state.working),
  }

  const id = trial.id ?? next.nextTrialId
  if (trial.id === undefined) {
    next.nextTrialId += 1
  }
  const recorded: TuneTrial = { ...trial, id }
  next.trials.push(recorded)
  next.pending = next.pending.filter((item) => item.id !== id)
  next.searchesUsed += recorded.searches
  if (budgetExhausted(next)) {
    next.exhausted = true
  }

  if (recorded.stage === "baseline" && recorded.label === "start") {
    next.baseline = recorded
  }

  if (recorded.label === "noise repeat" && next.baseline) {
    next.noiseFloor = measuredNoiseFloor(
      recorded.objective.value - next.baseline.objective.value,
    )
  }

  maybeAdoptChampion(next, recorded)

  if (recorded.scope === "holdout") {
    // Final holdoutObjective is chosen in selectChampionByHoldoutGap once all
    // near-tie holdout trials finish. Keep the latest as a fallback.
    next.holdoutObjective = recorded.objective
  }

  if (next.pending.length === 0) {
    finishBatch(next)
    advanceStage(next)
  }

  return next
}

/**
 * Marks the run stopped; keeps the champion.
 */
export function stopTuner(state: TunerState): TunerState {
  return {
    ...state,
    stopped: true,
    stage: "done",
    pending: [],
    batchIds: [],
  }
}

/**
 * Current champion trial, if any.
 */
export function championOf(state: TunerState): TuneTrial | null {
  return state.champion
}

/**
 * Human-readable rationale lines for the champion vs start.
 */
export function explainChampion(state: TunerState): string[] {
  const lines: string[] = []
  const champion = state.champion
  const baseline = state.baseline
  if (!champion || !baseline) {
    return lines
  }

  const gain = champion.objective.value - baseline.objective.value
  const metric = state.options.set.thresholds.metric
  lines.push(
    `Live ${metric} ${baseline.objective.primary.toFixed(3)} → ${
      champion.objective.primary.toFixed(3)
    } (objective ${gain >= 0 ? "+" : ""}${gain.toFixed(3)}; noise floor ${
      state.noiseFloor.toFixed(3)
    }).`,
  )

  const startWeights = baseline.config.weights
  const nextWeights = champion.config.weights
  const names = new Set([
    ...Object.keys(startWeights),
    ...Object.keys(nextWeights),
  ])
  for (const name of names) {
    const from = startWeights[name] ?? 1
    const to = nextWeights[name] ?? 1
    if (from === to) {
      continue
    }
    if (from > 0 && to <= 0) {
      lines.push(`Turned ${name} off.`)
    } else if (from <= 0 && to > 0) {
      lines.push(`Turned ${name} on at ${to}.`)
    } else {
      lines.push(`${name}: ${from} → ${to}.`)
    }
  }

  if (champion.config.fetchK !== baseline.config.fetchK) {
    lines.push(
      `Retrieval depth ${baseline.config.fetchK} → ${champion.config.fetchK} (grading k unchanged).`,
    )
  }

  const startEnabled = enabledAspectCount(startWeights)
  const endEnabled = enabledAspectCount(nextWeights)
  if (endEnabled < startEnabled) {
    lines.push(
      `Uses ${endEnabled} aspects instead of ${startEnabled} (parsimony).`,
    )
  }

  if (state.holdoutObjective) {
    const holdGain = state.holdoutObjective.value -
      champion.objective.value
    lines.push(
      `Holdout objective ${state.holdoutObjective.value.toFixed(3)} (${
        holdGain >= 0 ? "+" : ""
      }${holdGain.toFixed(3)} vs champion train).`,
    )
  }

  return lines
}

/**
 * Top trials by objective for the leaderboard.
 */
export function leaderboard(
  state: TunerState,
  limit = 8,
): TuneTrial[] {
  return [...state.trials]
    .filter((trial) => trial.scope !== "holdout")
    .sort((left, right) => right.objective.value - left.objective.value)
    .slice(0, limit)
}

function maybeAdoptChampion(state: TunerState, recorded: TuneTrial): void {
  if (recorded.scope === "holdout") {
    return
  }
  if (
    state.champion === null ||
    isBetterConfig(
      {
        value: recorded.objective.value,
        weights: recorded.config.weights,
        fetchK: recorded.config.fetchK,
      },
      {
        value: state.champion.objective.value,
        weights: state.champion.config.weights,
        fetchK: state.champion.config.fetchK,
      },
      state.options.start,
      state.noiseFloor,
    )
  ) {
    state.champion = recorded
  }
}

function finishBatch(state: TunerState): void {
  if (state.batchIds.length === 0) {
    return
  }

  const batch = state.trials.filter((trial) =>
    state.batchIds.includes(trial.id)
  )
  if (batch.length === 0) {
    state.batchIds = []
    state.batchAspect = null
    return
  }

  // Screen: adopt off only when within noise of the start config (parsimony).
  //
  // The reference is the baseline, not the champion, because every screen
  // trial is built from the current working config and so carries the drops
  // already adopted. Measuring against a reference that each adoption lowers
  // would let several within-noise losses compound into one large one.
  if (state.stage === "screen" && state.batchAspect) {
    const off = batch[0]
    const reference = state.baseline
    if (
      off && reference &&
      off.objective.value + state.noiseFloor >= reference.objective.value
    ) {
      state.working = cloneConfig(off.config)
      maybeAdoptChampion(state, off)
    }
    state.batchIds = []
    state.batchAspect = null
    return
  }

  // Coarse / refine: pick best in the batch as the new working weight for that aspect.
  if (
    (state.stage === "coarse" || state.stage === "refine") &&
    state.batchAspect
  ) {
    let best = batch[0]
    for (const trial of batch.slice(1)) {
      if (
        isBetterConfig(
          {
            value: trial.objective.value,
            weights: trial.config.weights,
            fetchK: trial.config.fetchK,
          },
          {
            value: best.objective.value,
            weights: best.config.weights,
            fetchK: best.config.fetchK,
          },
          state.options.start,
          state.noiseFloor,
        )
      ) {
        best = trial
      }
    }
    // Every queued candidate already differs from the working weight, so the
    // only question left is whether the batch winner holds up against the
    // reference within the noise floor.
    if (best.objective.value >= referenceValue(state) - state.noiseFloor) {
      state.working = cloneConfig(best.config)
      maybeAdoptChampion(state, best)
    }
    state.batchIds = []
    state.batchAspect = null
    return
  }

  if (state.stage === "depth") {
    let best = batch[0]
    for (const trial of batch.slice(1)) {
      if (trial.objective.value > best.objective.value) {
        best = trial
      }
    }
    if (
      best && best.objective.value >= referenceValue(state) - state.noiseFloor
    ) {
      state.working = cloneConfig(best.config)
      maybeAdoptChampion(state, best)
    }
    state.batchIds = []
    state.batchAspect = null
  }
}

function referenceValue(state: TunerState): number {
  return state.champion?.objective.value ??
    state.baseline?.objective.value ??
    -Infinity
}

function advanceStage(state: TunerState): void {
  if (state.stopped) {
    state.stage = "done"
    return
  }
  if (state.searchesUsed >= state.options.maxSearches) {
    state.exhausted = true
    beginConfirm(state)
    return
  }

  if (state.stage === "baseline") {
    state.stage = "screen"
    state.screenIndex = 0
    if (!queueNextScreen(state)) {
      beginCoarse(state)
    }
    return
  }

  if (state.stage === "screen") {
    if (!queueNextScreen(state)) {
      beginCoarse(state)
    }
    return
  }

  if (state.stage === "coarse") {
    if (!queueNextCoarse(state)) {
      beginRefine(state)
    }
    return
  }

  if (state.stage === "refine") {
    if (!queueNextRefine(state)) {
      if (state.options.space.tuneDepth) {
        state.stage = "depth"
        state.depthIndex = 0
        if (!queueNextDepth(state)) {
          beginConfirm(state)
        }
      } else {
        beginConfirm(state)
      }
    }
    return
  }

  if (state.stage === "depth") {
    if (!queueNextDepth(state)) {
      beginConfirm(state)
    }
    return
  }

  if (state.stage === "confirm") {
    if (!queueNextConfirm(state)) {
      if (!state.holdoutQueued) {
        state.holdoutQueued = true
        enqueueNearTieHoldouts(state)
        if (state.pending.length > 0) {
          return
        }
      }
      selectChampionByHoldoutGap(state)
      state.stage = "done"
    }
  }
}

function beginCoarse(state: TunerState): void {
  orderAspectsBySensitivity(state)
  state.stage = "coarse"
  state.coarseRound = 0
  state.aspectIndex = 0
  if (!queueNextCoarse(state)) {
    beginRefine(state)
  }
}

function beginRefine(state: TunerState): void {
  state.stage = "refine"
  state.refineRound = 0
  state.refineFactorIndex = 0
  state.aspectIndex = 0
  if (!queueNextRefine(state)) {
    if (state.options.space.tuneDepth) {
      state.stage = "depth"
      state.depthIndex = 0
      if (!queueNextDepth(state)) {
        beginConfirm(state)
      }
    } else {
      beginConfirm(state)
    }
  }
}

function beginConfirm(state: TunerState): void {
  state.stage = "confirm"
  state.confirmIndex = 0
  state.confirmQueue = leaderboard(state, 3).map((trial) => trial.id)
  state.batchIds = []
  state.batchAspect = null
  state.holdoutQueued = false

  // Remeasure top train trials first. Near-tie holdout scoring runs after
  // those confirms finish (see advanceStage confirm branch).
  if (state.pending.length === 0 && !queueNextConfirm(state)) {
    state.holdoutQueued = true
    enqueueNearTieHoldouts(state)
    if (state.pending.length === 0) {
      selectChampionByHoldoutGap(state)
      state.stage = "done"
    }
  }
}

/**
 * Enqueues holdout Live trials for train confirm configs within the noise
 * floor of the best remeasured train objective.
 */
function enqueueNearTieHoldouts(state: TunerState): void {
  if (state.options.holdoutIds.length === 0) {
    return
  }

  const confirms = state.trials.filter((trial) =>
    trial.stage === "confirm" &&
    trial.scope !== "holdout" &&
    trial.label.startsWith("confirm #")
  )

  const pool = confirms.length > 0
    ? confirms
    : state.champion
    ? [state.champion]
    : []
  if (pool.length === 0) {
    return
  }

  const bestTrain = Math.max(
    ...pool.map((trial) => trial.objective.value),
  )
  const near = pool.filter((trial) =>
    bestTrain - trial.objective.value <= state.noiseFloor
  )

  const seen = new Set<string>()
  for (const trial of near) {
    const key = JSON.stringify({
      weights: trial.config.weights,
      fetchK: trial.config.fetchK,
    })
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    enqueue(state, {
      config: cloneConfig(trial.config),
      scope: "holdout",
      stage: "confirm",
      label: `holdout confirm #${trial.id}`,
    })
  }
}

/**
 * Among Confirm holdout results, pick the near-tied train config with the
 * smallest |holdout − train| gap and set it as champion.
 */
function selectChampionByHoldoutGap(state: TunerState): void {
  const holdouts = state.trials.filter((trial) =>
    trial.scope === "holdout" && trial.stage === "confirm"
  )
  if (holdouts.length === 0) {
    return
  }

  type Candidate = {
    holdout: TuneTrial
    train: TuneTrial
  }
  const candidates: Candidate[] = []
  for (const holdout of holdouts) {
    const match = /^holdout confirm #(\d+)$/.exec(holdout.label)
    if (!match) {
      continue
    }
    const train = state.trials.find((trial) => trial.id === Number(match[1]))
    if (!train) {
      continue
    }
    candidates.push({ holdout, train })
  }
  if (candidates.length === 0) {
    state.holdoutObjective = holdouts[holdouts.length - 1]?.objective ?? null
    return
  }

  const bestTrain = Math.max(
    ...candidates.map((item) => item.train.objective.value),
  )
  const eligible = candidates.filter((item) =>
    bestTrain - item.train.objective.value <= state.noiseFloor
  )
  if (eligible.length === 0) {
    state.holdoutObjective = holdouts[holdouts.length - 1]?.objective ?? null
    return
  }

  let best = eligible[0]
  for (const item of eligible.slice(1)) {
    const gapBest = Math.abs(
      best.holdout.objective.value - best.train.objective.value,
    )
    const gapItem = Math.abs(
      item.holdout.objective.value - item.train.objective.value,
    )
    if (gapItem < gapBest - 1e-12) {
      best = item
      continue
    }
    if (Math.abs(gapItem - gapBest) > 1e-12) {
      continue
    }
    if (item.holdout.objective.value > best.holdout.objective.value + 1e-12) {
      best = item
      continue
    }
    if (
      Math.abs(
          item.holdout.objective.value - best.holdout.objective.value,
        ) <= 1e-12 &&
      isBetterConfig(
        {
          value: item.train.objective.value,
          weights: item.holdout.config.weights,
          fetchK: item.holdout.config.fetchK,
        },
        {
          value: best.train.objective.value,
          weights: best.holdout.config.weights,
          fetchK: best.holdout.config.fetchK,
        },
        state.options.start,
        state.noiseFloor,
      )
    ) {
      best = item
    }
  }

  state.champion = best.train
  state.holdoutObjective = best.holdout.objective
}

function queueNextScreen(state: TunerState): boolean {
  const aspects = screenableAspects(state)
  while (state.screenIndex < aspects.length) {
    if (budgetLeft(state) <= 0) {
      state.exhausted = true
      return false
    }
    const name = aspects[state.screenIndex]
    state.screenIndex += 1
    const current = state.working.weights[name] ?? 1
    if (current <= 0) {
      continue
    }
    const config = cloneConfig(state.working)
    config.weights[name] = 0
    const id = enqueue(state, {
      config,
      scope: trainScope(state.options),
      stage: "screen",
      label: `off ${name}`,
    })
    state.batchIds = [id]
    state.batchAspect = name
    return true
  }
  return false
}

function queueNextCoarse(state: TunerState): boolean {
  const aspects = state.aspectOrder
  const maxRounds = 2
  while (state.coarseRound < maxRounds) {
    while (state.aspectIndex < aspects.length) {
      if (budgetLeft(state) <= 0) {
        state.exhausted = true
        return false
      }
      const name = aspects[state.aspectIndex]
      state.aspectIndex += 1
      const space = state.options.space.aspects.find((item) =>
        item.name === name
      )
      if (!space || space.freeze || !space.tuneWeight) {
        continue
      }

      const ids: number[] = []
      for (const weight of COARSE_WEIGHT_GRID) {
        const snapped = snapWeight(weight)
        if ((state.working.weights[name] ?? 1) === snapped) {
          continue
        }
        const config = cloneConfig(state.working)
        config.weights[name] = snapped
        ids.push(enqueue(state, {
          config,
          scope: trainScope(state.options),
          stage: "coarse",
          label: `${name}=${snapped}`,
        }))
      }
      if (ids.length > 0) {
        state.batchIds = ids
        state.batchAspect = name
        return true
      }
    }
    state.coarseRound += 1
    state.aspectIndex = 0
  }
  return false
}

function queueNextRefine(state: TunerState): boolean {
  const aspects = state.aspectOrder
  const maxRounds = 2
  while (state.refineFactorIndex < REFINE_FACTORS.length) {
    const factor = REFINE_FACTORS[state.refineFactorIndex]
    while (state.refineRound < maxRounds) {
      while (state.aspectIndex < aspects.length) {
        if (budgetLeft(state) <= 0) {
          state.exhausted = true
          return false
        }
        const name = aspects[state.aspectIndex]
        state.aspectIndex += 1
        const space = state.options.space.aspects.find((item) =>
          item.name === name
        )
        if (!space || space.freeze || !space.tuneWeight) {
          continue
        }
        const current = state.working.weights[name] ?? 1
        if (current <= 0) {
          continue
        }
        const ids: number[] = []
        for (const direction of [factor, 1 / factor]) {
          const snapped = snapWeight(current * direction)
          if (snapped === current || snapped <= 0) {
            continue
          }
          const config = cloneConfig(state.working)
          config.weights[name] = snapped
          ids.push(enqueue(state, {
            config,
            scope: trainScope(state.options),
            stage: "refine",
            label: `${name}=${snapped}`,
          }))
        }
        if (ids.length > 0) {
          state.batchIds = ids
          state.batchAspect = name
          return true
        }
      }
      state.refineRound += 1
      state.aspectIndex = 0
    }
    state.refineFactorIndex += 1
    state.refineRound = 0
    state.aspectIndex = 0
  }
  return false
}

function queueNextDepth(state: TunerState): boolean {
  const baseK = deepestGradingK(
    state.options.set,
    state.options.start.weights,
  )
  const ids: number[] = []
  while (state.depthIndex < DEPTH_MULTIPLES.length) {
    if (budgetLeft(state) <= 0) {
      state.exhausted = true
      break
    }
    const multiple = DEPTH_MULTIPLES[state.depthIndex]
    state.depthIndex += 1
    const fetchK = baseK * multiple
    if (fetchK === state.working.fetchK) {
      continue
    }
    const config = cloneConfig(state.working)
    config.fetchK = fetchK
    ids.push(enqueue(state, {
      config,
      scope: trainScope(state.options),
      stage: "depth",
      label: `fetchK=${fetchK}`,
    }))
  }
  if (ids.length === 0) {
    return false
  }
  state.batchIds = ids
  state.batchAspect = null
  return true
}

function queueNextConfirm(state: TunerState): boolean {
  while (state.confirmIndex < state.confirmQueue.length) {
    if (budgetLeft(state) <= 0) {
      state.exhausted = true
      return false
    }
    const trialId = state.confirmQueue[state.confirmIndex]
    state.confirmIndex += 1
    const prior = state.trials.find((trial) => trial.id === trialId)
    if (!prior) {
      continue
    }
    enqueue(state, {
      config: cloneConfig(prior.config),
      scope: trainScope(state.options),
      stage: "confirm",
      label: `confirm #${trialId}`,
      bypassCache: true,
    })
    return true
  }
  return false
}

function orderAspectsBySensitivity(state: TunerState): void {
  const deltas = new Map<string, number>()
  for (const trial of state.trials) {
    if (trial.stage !== "screen" || !state.baseline) {
      continue
    }
    const match = /^off (.+)$/.exec(trial.label)
    if (!match) {
      continue
    }
    deltas.set(
      match[1],
      Math.abs(trial.objective.value - state.baseline.objective.value),
    )
  }
  state.aspectOrder = [...tunableNames(state.options.space)].sort((
    left,
    right,
  ) => (deltas.get(right) ?? 0) - (deltas.get(left) ?? 0))
}

function screenableAspects(state: TunerState): string[] {
  return state.options.space.aspects
    .filter((aspect) => aspect.allowOff && !aspect.freeze)
    .map((aspect) => aspect.name)
}

function tunableNames(space: TuneSpace): string[] {
  return space.aspects
    .filter((aspect) => aspect.tuneWeight && !aspect.freeze)
    .map((aspect) => aspect.name)
}

function enqueue(
  state: TunerState,
  request: Omit<TuneTrialRequest, "id">,
): number {
  const id = state.nextTrialId
  state.nextTrialId += 1
  state.pending.push({ ...request, id })
  return id
}

function budgetLeft(state: TunerState): number {
  return state.options.maxSearches - state.searchesUsed
}

function trainScope(options: TunerOptions): "train" | "all" {
  return options.holdoutIds.length > 0 ? "train" : "all"
}

function cloneConfig(config: TuneConfig): TuneConfig {
  return {
    weights: { ...config.weights },
    fetchK: config.fetchK,
  }
}

function allWeightsOne(start: TuneConfig): TuneConfig {
  return {
    weights: Object.fromEntries(
      Object.keys(start.weights).map((name) => [name, 1]),
    ),
    fetchK: start.fetchK,
  }
}

function sameConfig(left: TuneConfig, right: TuneConfig): boolean {
  if (left.fetchK !== right.fetchK) {
    return false
  }
  const names = new Set([
    ...Object.keys(left.weights),
    ...Object.keys(right.weights),
  ])
  for (const name of names) {
    if ((left.weights[name] ?? 1) !== (right.weights[name] ?? 1)) {
      return false
    }
  }
  return true
}
