import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  AutoTuneHistory,
  formatTunedWeightLines,
} from "./auto-tune-history.tsx"
import {
  TUNED_CONFIG_VERSION,
  type TunedConfig,
} from "@/lib/aspected/tuned-config.ts"

function sample(overrides: Partial<TunedConfig> = {}): TunedConfig {
  return {
    version: TUNED_CONFIG_VERSION,
    id: "cfg-1",
    name: "Movies baseline · test",
    indexName: "movies",
    goldenSetId: "set-1",
    goldenSetName: "Movies baseline",
    weights: {
      title: 0.331,
      overview: 1,
      popularity: 0,
      rating: 4.79,
    },
    fetchK: 10,
    primaryMetric: "ndcg",
    trainPrimary: 0.637,
    holdoutPrimary: 0.648,
    objectiveValue: 0.637,
    noiseFloor: 0.002,
    rationale: [],
    createdAt: 1,
    holdoutSeed: null,
    ...overrides,
  }
}

describe("formatTunedWeightLines", () => {
  it("lists every aspect, shows 0 as off, and includes fetchK", () => {
    expect(
      formatTunedWeightLines(
        { title: 0.331, overview: 1, popularity: 0, rating: 4.79 },
        10,
      ),
    ).toEqual([
      "overview: 1",
      "popularity: off",
      "rating: 4.79",
      "title: 0.331",
      "fetchK: 10",
    ])
  })
})

describe("AutoTuneHistory", () => {
  it("renders all weights including 1 and off", () => {
    render(
      <AutoTuneHistory
        configs={[sample()]}
        onApply={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText("overview: 1")).toBeInTheDocument()
    expect(screen.getByText("popularity: off")).toBeInTheDocument()
    expect(screen.getByText("title: 0.331")).toBeInTheDocument()
  })
})
