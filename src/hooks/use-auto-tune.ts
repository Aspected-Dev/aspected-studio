import { useCallback, useRef, useState } from "react"
import { useConnection } from "@/hooks/use-connection.tsx"
import type { AspectedClient } from "@/lib/aspected/client.ts"
import type { GoldenSet } from "@/lib/aspected/golden.ts"
import {
  buildCaseRequest,
  type CaseRun,
  caseScoringWeights,
  caseSignature,
} from "@/lib/aspected/scorecard.ts"
import {
  casePrimaries,
  type CasePrimary,
  liveObjective,
  splitHoldout,
} from "@/lib/aspected/tune-objective.ts"
import {
  championOf,
  createTunerState,
  explainChampion,
  leaderboard,
  nextCandidates,
  recordTrial,
  stopTuner,
  type TuneConfig,
  type TunerState,
  type TuneSpace,
  type TuneStage,
  type TuneTrial,
} from "@/lib/aspected/tuner.ts"
import {
  toastCaughtError,
  toUserFacingError,
} from "@/lib/aspected/user-error.ts"

/** Default worker pool size while evaluating one trial's cases. */
export const DEFAULT_TUNE_CONCURRENCY = 4

/** Progress of the current auto-tune run. */
export type AutoTuneProgress = {
  stage: TuneStage
  searchesUsed: number
  maxSearches: number
  trialsDone: number
  cacheHits: number
  cacheMisses: number
  elapsedMs: number
  /** Mean search latency from cache misses, or null before any miss. */
  meanSearchMs: number | null
}

/** Snapshot the UI reads while a run is active or finished. */
export type AutoTuneSnapshot = {
  running: boolean
  progress: AutoTuneProgress
  trials: TuneTrial[]
  champion: TuneTrial | null
  baseline: TuneTrial | null
  holdoutObjective: TuneTrial["objective"] | null
  noiseFloor: number
  rationale: string[]
  leaderboard: TuneTrial[]
  caseDeltas: Array<CasePrimary & { baseline: number; delta: number }>
  stopped: boolean
  exhausted: boolean
  stage: TuneStage
  trainIds: string[]
  holdoutIds: string[]
  seed: number | null
}

/** Options passed to {@link useAutoTune}'s start. */
export type AutoTuneStartOptions = {
  set: GoldenSet
  start: TuneConfig
  space: TuneSpace
  maxSearches: number
  concurrency?: number
  /** When true (default), split when the set is large enough. */
  useHoldout?: boolean
  holdoutSeed?: number
  wallClockMs?: number | null
}

const EMPTY_PROGRESS: AutoTuneProgress = {
  stage: "baseline",
  searchesUsed: 0,
  maxSearches: 0,
  trialsDone: 0,
  cacheHits: 0,
  cacheMisses: 0,
  elapsedMs: 0,
  meanSearchMs: null,
}

const EMPTY_SNAPSHOT: AutoTuneSnapshot = {
  running: false,
  progress: EMPTY_PROGRESS,
  trials: [],
  champion: null,
  baseline: null,
  holdoutObjective: null,
  noiseFloor: 0.002,
  rationale: [],
  leaderboard: [],
  caseDeltas: [],
  stopped: false,
  exhausted: false,
  stage: "done",
  trainIds: [],
  holdoutIds: [],
  seed: null,
}

/** State and controls returned by {@link useAutoTune}. */
export type AutoTuneState = AutoTuneSnapshot & {
  /** Starts a new run, cancelling any previous one. */
  start: (options: AutoTuneStartOptions) => Promise<void>
  /** Stops the run; keeps the best-so-far champion. */
  stop: () => void
  /** Clears snapshot and cache. */
  reset: () => void
}

/**
 * Drives a Live auto-tune run: planner proposes, this hook searches.
 */
export function useAutoTune(indexName: string): AutoTuneState {
  const { client } = useConnection()
  const [snapshot, setSnapshot] = useState<AutoTuneSnapshot>(EMPTY_SNAPSHOT)

  const runIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const cacheRef = useRef(new Map<string, CaseRun>())
  const latencyRef = useRef<number[]>([])
  const startedAtRef = useRef(0)
  const hitsRef = useRef(0)
  const missesRef = useRef(0)
  const stateRef = useRef<TunerState | null>(null)
  const lastRunsRef = useRef(new Map<string, CaseRun>())
  const baselineRunsRef = useRef(new Map<string, CaseRun>())

  const stop = useCallback(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (stateRef.current) {
      const stopped = stopTuner(stateRef.current)
      stateRef.current = stopped
      setSnapshot(snapshotFromState(stopped, {
        hits: hitsRef.current,
        misses: missesRef.current,
        startedAt: startedAtRef.current,
        latencies: latencyRef.current,
        baselineRuns: baselineRunsRef.current,
        championRuns: lastRunsRef.current,
      }))
    } else {
      setSnapshot((current) => ({ ...current, running: false, stopped: true }))
    }
  }, [])

  const reset = useCallback(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    cacheRef.current = new Map()
    latencyRef.current = []
    hitsRef.current = 0
    missesRef.current = 0
    stateRef.current = null
    lastRunsRef.current = new Map()
    baselineRunsRef.current = new Map()
    setSnapshot(EMPTY_SNAPSHOT)
  }, [])

  const start = useCallback(
    async (options: AutoTuneStartOptions) => {
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      cacheRef.current = new Map()
      latencyRef.current = []
      hitsRef.current = 0
      missesRef.current = 0
      startedAtRef.current = Date.now()
      lastRunsRef.current = new Map()
      baselineRunsRef.current = new Map()

      const seed = options.holdoutSeed ?? Date.now()
      const useHoldout = options.useHoldout !== false
      const split = useHoldout ? splitHoldout(options.set.cases, seed) : null
      const trainIds = split?.trainIds ??
        options.set.cases.filter((item) => item.enabled).map((item) => item.id)
      const holdoutIds = split?.holdoutIds ?? []

      let state = createTunerState({
        set: options.set,
        start: options.start,
        space: options.space,
        trainIds,
        holdoutIds,
        maxSearches: options.maxSearches,
      })
      stateRef.current = state

      const concurrency = Math.max(
        1,
        options.concurrency ?? DEFAULT_TUNE_CONCURRENCY,
      )
      const wallClockMs = options.wallClockMs ?? null

      setSnapshot(snapshotFromState(state, {
        hits: 0,
        misses: 0,
        startedAt: startedAtRef.current,
        latencies: [],
        baselineRuns: new Map(),
        championRuns: new Map(),
        running: true,
        seed,
        trainIds,
        holdoutIds,
      }))

      try {
        while (
          runIdRef.current === runId &&
          state.stage !== "done" &&
          !state.stopped
        ) {
          if (
            wallClockMs !== null &&
            Date.now() - startedAtRef.current >= wallClockMs
          ) {
            state = stopTuner(state)
            stateRef.current = state
            break
          }

          const pending = nextCandidates(state)
          if (pending.length === 0) {
            break
          }

          for (const request of pending) {
            if (runIdRef.current !== runId || abort.signal.aborted) {
              break
            }

            const caseIds = request.scope === "holdout" ? holdoutIds : trainIds
            const { runs, searches } = await evaluateConfig({
              client,
              indexName,
              set: options.set,
              config: request.config,
              caseIds,
              cache: cacheRef.current,
              signal: abort.signal,
              concurrency,
              bypassCache: request.bypassCache === true,
              onHit: () => {
                hitsRef.current += 1
              },
              onMiss: (ms) => {
                missesRef.current += 1
                latencyRef.current.push(ms)
              },
            })

            if (runIdRef.current !== runId) {
              return
            }

            lastRunsRef.current = runs
            if (request.label === "start") {
              baselineRunsRef.current = runs
            }

            const objective = liveObjective(
              options.set,
              runs,
              new Set(caseIds),
            )

            state = recordTrial(state, {
              id: request.id,
              config: request.config,
              objective,
              scope: request.scope,
              stage: request.stage,
              searches,
              label: request.label,
              bypassCache: request.bypassCache,
            })
            stateRef.current = state

            setSnapshot(snapshotFromState(state, {
              hits: hitsRef.current,
              misses: missesRef.current,
              startedAt: startedAtRef.current,
              latencies: latencyRef.current,
              baselineRuns: baselineRunsRef.current,
              championRuns: lastRunsRef.current,
              running: state.stage !== "done",
              seed,
              trainIds,
              holdoutIds,
            }))
          }
        }
      } catch (caught) {
        if (abort.signal.aborted || runIdRef.current !== runId) {
          return
        }
        toastCaughtError(caught, "Auto-tune failed")
        if (stateRef.current) {
          state = stopTuner(stateRef.current)
          stateRef.current = state
          setSnapshot(snapshotFromState(state, {
            hits: hitsRef.current,
            misses: missesRef.current,
            startedAt: startedAtRef.current,
            latencies: latencyRef.current,
            baselineRuns: baselineRunsRef.current,
            championRuns: lastRunsRef.current,
            seed,
            trainIds,
            holdoutIds,
          }))
        }
        return
      }

      if (runIdRef.current !== runId) {
        return
      }

      if (stateRef.current && stateRef.current.stage !== "done") {
        state = stopTuner(stateRef.current)
        stateRef.current = state
      }

      setSnapshot(snapshotFromState(stateRef.current ?? state, {
        hits: hitsRef.current,
        misses: missesRef.current,
        startedAt: startedAtRef.current,
        latencies: latencyRef.current,
        baselineRuns: baselineRunsRef.current,
        championRuns: lastRunsRef.current,
        running: false,
        seed,
        trainIds,
        holdoutIds,
      }))
    },
    [client, indexName],
  )

  return {
    ...snapshot,
    start,
    stop,
    reset,
  }
}

function snapshotFromState(
  state: TunerState,
  extras: {
    hits: number
    misses: number
    startedAt: number
    latencies: number[]
    baselineRuns: Map<string, CaseRun>
    championRuns: Map<string, CaseRun>
    running?: boolean
    seed?: number | null
    trainIds?: string[]
    holdoutIds?: string[]
  },
): AutoTuneSnapshot {
  const champion = championOf(state)
  const meanSearchMs = extras.latencies.length > 0
    ? extras.latencies.reduce((sum, ms) => sum + ms, 0) /
      extras.latencies.length
    : null

  const caseDeltas: AutoTuneSnapshot["caseDeltas"] = []
  if (extras.baselineRuns.size > 0 && extras.championRuns.size > 0) {
    const base = casePrimaries(state.options.set, extras.baselineRuns)
    const next = casePrimaries(state.options.set, extras.championRuns)
    const nextById = new Map(next.map((item) => [item.caseId, item]))
    for (const item of base) {
      const after = nextById.get(item.caseId)
      if (!after) {
        continue
      }
      caseDeltas.push({
        ...after,
        baseline: item.primary,
        delta: after.primary - item.primary,
      })
    }
  }

  return {
    running: extras.running ?? state.stage !== "done",
    progress: {
      stage: state.stage,
      searchesUsed: state.searchesUsed,
      maxSearches: state.options.maxSearches,
      trialsDone: state.trials.length,
      cacheHits: extras.hits,
      cacheMisses: extras.misses,
      elapsedMs: Math.max(0, Date.now() - extras.startedAt),
      meanSearchMs,
    },
    trials: state.trials,
    champion,
    baseline: state.baseline,
    holdoutObjective: state.holdoutObjective,
    noiseFloor: state.noiseFloor,
    rationale: explainChampion(state),
    leaderboard: leaderboard(state),
    caseDeltas,
    stopped: state.stopped,
    exhausted: state.exhausted,
    stage: state.stage,
    trainIds: extras.trainIds ?? state.options.trainIds,
    holdoutIds: extras.holdoutIds ?? state.options.holdoutIds,
    seed: extras.seed ?? null,
  }
}

async function evaluateConfig(options: {
  client: AspectedClient
  indexName: string
  set: GoldenSet
  config: TuneConfig
  caseIds: string[]
  cache: Map<string, CaseRun>
  signal: AbortSignal
  concurrency: number
  bypassCache: boolean
  onHit: () => void
  onMiss: (ms: number) => void
}): Promise<{ runs: Map<string, CaseRun>; searches: number }> {
  const cases = options.set.cases.filter((item) =>
    item.enabled && options.caseIds.includes(item.id)
  )
  const collected = new Map<string, CaseRun>()
  let searches = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < cases.length) {
      if (options.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      const item = cases[cursor]
      cursor += 1

      const signature = caseSignature(
        item,
        options.config.weights,
        options.config.fetchK,
      )
      const cached = options.bypassCache
        ? undefined
        : options.cache.get(signature)
      if (cached && cached.error === null) {
        options.onHit()
        collected.set(item.id, cached)
        continue
      }

      const started = performance.now()
      try {
        const body = buildCaseRequest(
          item,
          options.config.weights,
          options.config.fetchK,
        )
        const response = await options.client.searchIndex(
          options.indexName,
          body,
          { signal: options.signal },
        )
        const run: CaseRun = {
          caseId: item.id,
          rows: response.data,
          weightsUsed: caseScoringWeights(item, options.config.weights),
          request: body,
          signature,
          error: null,
        }
        options.cache.set(signature, run)
        collected.set(item.id, run)
        searches += 1
        options.onMiss(performance.now() - started)
      } catch (caught) {
        if (options.signal.aborted) {
          throw caught
        }
        const run: CaseRun = {
          caseId: item.id,
          rows: [],
          weightsUsed: caseScoringWeights(item, options.config.weights),
          request: { k: options.config.fetchK, query: {} },
          signature,
          error: toUserFacingError(caught, "Case failed").title,
        }
        collected.set(item.id, run)
        searches += 1
        options.onMiss(performance.now() - started)
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, Math.max(1, cases.length)) },
      () => worker(),
    ),
  )

  return { runs: collected, searches }
}
