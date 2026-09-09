import { useCallback, useRef, useState } from "react"
import { useConnection } from "@/hooks/use-connection.tsx"
import { caseK } from "@/lib/aspected/golden.ts"
import type { GoldenSet } from "@/lib/aspected/golden.ts"
import {
  buildCaseRequest,
  type CaseRun,
  caseScoringWeights,
  caseSignature,
  runnableCases,
} from "@/lib/aspected/scorecard.ts"
import {
  toastCaughtError,
  toUserFacingError,
} from "@/lib/aspected/user-error.ts"

/** Requests kept in flight at once while a set runs. */
const CONCURRENCY = 4

/** Progress of the current or last run. */
export type ScorecardProgress = {
  done: number
  total: number
}

/** State and controls returned by {@link useScorecard}. */
export type ScorecardState = {
  /** Cached runs keyed by case id. */
  runs: Map<string, CaseRun>
  running: boolean
  progress: ScorecardProgress
  /** When the last run finished. */
  ranAt: number | null
  /** Weights the last run was executed with. */
  ranWeights: Record<string, number> | null
  /** Runs the enabled cases in a set, skipping ones whose request is unchanged. */
  run: (
    set: GoldenSet,
    weights: Record<string, number>,
  ) => Promise<Map<string, CaseRun>>
  /** Abandons the run in flight. Results already collected are kept. */
  cancel: () => void
  /** Drops every cached run. */
  clear: () => void
}

/**
 * Runs a golden set against the connected server and caches the rows.
 *
 * Cases run in a small pool rather than one at a time, because a set is a
 * batch of independent searches and serialising them makes a fifty-case set
 * feel broken. A run id guards the state writes so a superseded run cannot
 * land on top of a newer one, and unchanged cases are skipped on a re-run.
 *
 * Rows are kept so weight changes can be graded locally through
 * `scoreRunAtWeights` without touching the network again.
 */
export function useScorecard(indexName: string): ScorecardState {
  const { client } = useConnection()
  const [runs, setRuns] = useState<Map<string, CaseRun>>(new Map())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ScorecardProgress>({
    done: 0,
    total: 0,
  })
  const [ranAt, setRanAt] = useState<number | null>(null)
  const [ranWeights, setRanWeights] = useState<Record<string, number> | null>(
    null,
  )
  const runIdRef = useRef(0)

  const cancel = useCallback(() => {
    runIdRef.current += 1
    setRunning(false)
  }, [])

  const clear = useCallback(() => {
    runIdRef.current += 1
    setRuns(new Map())
    setRanAt(null)
    setRanWeights(null)
    setProgress({ done: 0, total: 0 })
    setRunning(false)
  }, [])

  const run = useCallback(
    async (set: GoldenSet, weights: Record<string, number>) => {
      const runId = runIdRef.current + 1
      runIdRef.current = runId

      const pending = runnableCases(set, weights)
      setRunning(true)
      setProgress({ done: 0, total: pending.length })

      if (pending.length === 0) {
        setRunning(false)
        setRanAt(Date.now())
        setRanWeights({ ...weights })
        return new Map(runs)
      }

      const collected = new Map<string, CaseRun>()
      let done = 0
      let cursor = 0
      let firstFailure: unknown = null

      const worker = async () => {
        while (cursor < pending.length && runIdRef.current === runId) {
          const item = pending[cursor]
          cursor += 1

          const signature = caseSignature(item, weights, caseK(set, item))
          const cached = runs.get(item.id)
          if (cached && cached.signature === signature && !cached.error) {
            collected.set(item.id, cached)
            done += 1
            setProgress({ done, total: pending.length })
            continue
          }

          try {
            const body = buildCaseRequest(item, weights, caseK(set, item))
            const response = await client.searchIndex(indexName, body)
            collected.set(item.id, {
              caseId: item.id,
              rows: response.data,
              weightsUsed: caseScoringWeights(item, weights),
              request: body,
              signature,
              error: null,
            })
          } catch (caught) {
            firstFailure ??= caught
            collected.set(item.id, {
              caseId: item.id,
              rows: [],
              weightsUsed: caseScoringWeights(item, weights),
              request: { k: caseK(set, item), query: {} },
              signature,
              error: toUserFacingError(caught, "Case failed").title,
            })
          }

          done += 1
          setProgress({ done, total: pending.length })
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
      )

      if (runIdRef.current !== runId) {
        return collected
      }

      setRuns(collected)
      setRanAt(Date.now())
      setRanWeights({ ...weights })
      setRunning(false)

      if (firstFailure !== null) {
        toastCaughtError(firstFailure, "Scorecard run failed")
      }

      return collected
    },
    [client, indexName, runs],
  )

  return {
    runs,
    running,
    progress,
    ranAt,
    ranWeights,
    run,
    cancel,
    clear,
  }
}
