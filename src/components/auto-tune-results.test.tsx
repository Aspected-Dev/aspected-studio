import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  AutoTuneResults,
  holdoutHint,
} from "@/components/auto-tune-results.tsx"
import type { AutoTuneSnapshot } from "@/hooks/use-auto-tune.ts"
import type { TuneTrial } from "@/lib/aspected/tuner.ts"
import { TUNE_RESULT_HELP } from "@/lib/aspected/tune-objective.ts"
import type { ScorecardSummary } from "@/lib/aspected/relevance.ts"

describe("holdoutHint", () => {
  it("reports the gap against the train champion once the holdout is scored", () => {
    expect(holdoutHint(0.94, 1, 3)).toBe("-0.060 vs train champion")
    expect(holdoutHint(1, 0.94, 3)).toBe("+0.060 vs train champion")
  })

  it("keeps a scored holdout of zero out of the unmeasured branch", () => {
    expect(holdoutHint(0, 0.5, 3)).toBe("-0.500 vs train champion")
  })

  it("says the split never happened when there are no held-out cases", () => {
    expect(holdoutHint(null, 1, 0)).toBe(
      "Holdout was off or the set was too small",
    )
  })

  it("does not blame the split size when the run ended before confirm", () => {
    const hint = holdoutHint(null, 1, 3)

    expect(hint).toBe(
      "Run ended before the confirm stage scored the 3 held-out cases",
    )
    expect(hint).not.toMatch(/too small/)
  })
})

function summary(value: number): ScorecardSummary {
  return {
    cases: 1,
    scored: 1,
    green: 0,
    amber: 0,
    red: 0,
    forbidden: 0,
    precision: value,
    recall: value,
    mrr: value,
    ndcg: value,
    map: value,
  }
}

function trial(partial: Partial<TuneTrial> & Pick<TuneTrial, "id">): TuneTrial {
  const value = partial.objective?.value ?? 0.5
  return {
    label: "start",
    stage: "baseline",
    config: { weights: { title: 1 }, fetchK: 10 },
    objective: {
      primary: value,
      value,
      summary: summary(value),
    },
    casePrimaries: [],
    searches: 1,
    cacheHits: 0,
    ...partial,
  }
}

describe("AutoTuneResults help", () => {
  it("exposes help for start, champion, holdout, and per-case deltas", () => {
    const baseline = trial({
      id: 1,
      objective: {
        primary: 0.4,
        value: 0.4,
        summary: summary(0.4),
      },
    })
    const champion = trial({
      id: 2,
      label: "champion",
      objective: {
        primary: 0.5,
        value: 0.5,
        summary: summary(0.5),
      },
    })
    const snapshot: AutoTuneSnapshot = {
      running: false,
      progress: {
        stage: "done",
        searchesUsed: 10,
        maxSearches: 100,
        trialsDone: 2,
        cacheHits: 0,
        cacheMisses: 10,
        elapsedMs: 1000,
        meanSearchMs: 100,
      },
      champion,
      baseline,
      holdoutObjective: {
        primary: 0.45,
        value: 0.45,
        summary: summary(0.45),
      },
      rationale: ["test"],
      leaderboard: [champion],
      caseDeltas: [],
      noiseFloor: 0.002,
      stopped: false,
      exhausted: false,
      stage: "done",
      trainIds: ["t1"],
      holdoutIds: ["a", "b", "c"],
      seed: 1,
      trials: [baseline, champion],
    }

    render(
      <AutoTuneResults
        snapshot={snapshot}
        onApply={() => {}}
        onSave={() => {}}
      />,
    )

    expect(screen.getByRole("button", { name: "About Start objective" }))
      .toBeTruthy()
    expect(screen.getByRole("button", { name: "About Champion objective" }))
      .toBeTruthy()
    expect(screen.getByRole("button", { name: "About Holdout" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "About per-case primary delta" }),
    ).toBeTruthy()
    expect(TUNE_RESULT_HELP.holdout).toMatch(/Confirm/)
    expect(TUNE_RESULT_HELP.holdout).toMatch(/Scorecard/)
    expect(
      screen.getByText(/Holdout is a little behind the train champion/i),
    ).toBeInTheDocument()
  })
})
