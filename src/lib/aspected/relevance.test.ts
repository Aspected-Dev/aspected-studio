import { describe, expect, it } from "vitest"
import {
  gradeCase,
  metricLabel,
  metricValue,
  scoreCase,
  summariseScorecard,
} from "./relevance.ts"
import type { GoldenThresholds } from "./golden.ts"

function judgements(
  entries: Array<[string, number]>,
): Map<string, number> {
  return new Map(entries)
}

const thresholds: GoldenThresholds = {
  metric: "ndcg",
  green: 0.8,
  amber: 0.5,
}

describe("scoreCase", () => {
  it("counts hits inside the cut-off only", () => {
    const score = scoreCase(
      ["a", "b", "c", "d"],
      judgements([["a", 1], ["d", 1]]),
      2,
    )

    expect(score.hits).toBe(1)
    expect(score.precision).toBeCloseTo(0.5)
    expect(score.recall).toBeCloseTo(0.5)
    expect(score.missing).toEqual(["d"])
    expect(score.unexpected).toEqual(["b"])
  })

  it("divides precision by the results returned when fewer than k", () => {
    const score = scoreCase(["a", "b"], judgements([["a", 1]]), 10)

    expect(score.retrieved).toBe(2)
    expect(score.precision).toBeCloseTo(0.5)
  })

  it("scores a perfect ranking at 1 on every metric", () => {
    const score = scoreCase(
      ["a", "b", "c"],
      judgements([["a", 1], ["b", 1], ["c", 1]]),
      3,
    )

    expect(score.precision).toBe(1)
    expect(score.recall).toBe(1)
    expect(score.mrr).toBe(1)
    expect(score.ndcg).toBeCloseTo(1)
    expect(score.ap).toBeCloseTo(1)
    expect(score.f1).toBeCloseTo(1)
  })

  it("reports the reciprocal rank of the first relevant document", () => {
    const score = scoreCase(["x", "y", "a"], judgements([["a", 1]]), 5)

    expect(score.firstRelevantRank).toBe(3)
    expect(score.mrr).toBeCloseTo(1 / 3)
  })

  it("orders graded gains through the log2 discount", () => {
    const strong = scoreCase(["a", "b"], judgements([["a", 3], ["b", 1]]), 2)
    const weak = scoreCase(["b", "a"], judgements([["a", 3], ["b", 1]]), 2)

    // DCG = 3/log2(2) + 1/log2(3) = 3.6309, IDCG matches, so nDCG is 1.
    expect(strong.ndcg).toBeCloseTo(1)
    // Swapped: 1/log2(2) + 3/log2(3) = 2.8928 over the same ideal.
    expect(weak.ndcg).toBeCloseTo(2.892789 / 3.630930, 5)
    expect(weak.ndcg).toBeLessThan(strong.ndcg)
  })

  it("truncates the ideal ranking at k so nDCG can still reach 1", () => {
    const score = scoreCase(
      ["a", "b"],
      judgements([["a", 1], ["b", 1], ["c", 1], ["d", 1]]),
      2,
    )

    expect(score.ndcg).toBeCloseTo(1)
    expect(score.recall).toBeCloseTo(0.5)
  })

  it("returns zeroes for a case with no judgements", () => {
    const score = scoreCase(["a", "b"], judgements([]), 5)

    expect(score.relevantTotal).toBe(0)
    expect(score.precision).toBe(0)
    expect(score.recall).toBe(0)
    expect(score.ndcg).toBe(0)
    expect(score.ap).toBe(0)
    expect(score.mrr).toBe(0)
    expect(score.unexpected).toEqual(["a", "b"])
  })

  it("rewards early hits through average precision", () => {
    const early = scoreCase(
      ["a", "x", "b", "y"],
      judgements([["a", 1], ["b", 1]]),
      4,
    )
    const late = scoreCase(
      ["x", "a", "y", "b"],
      judgements([["a", 1], ["b", 1]]),
      4,
    )

    // (1/1 + 2/3) / 2 against (1/2 + 2/4) / 2.
    expect(early.ap).toBeCloseTo((1 + 2 / 3) / 2)
    expect(late.ap).toBeCloseTo(0.5)
    expect(early.precision).toBeCloseTo(late.precision)
  })

  it("reports forbidden documents inside the cut-off", () => {
    const score = scoreCase(
      ["a", "banned", "b"],
      judgements([["a", 1]]),
      3,
      ["banned", "elsewhere"],
    )

    expect(score.forbiddenHits).toEqual(["banned"])
  })

  it("ignores forbidden documents beyond the cut-off", () => {
    const score = scoreCase(
      ["a", "banned"],
      judgements([["a", 1]]),
      1,
      ["banned"],
    )

    expect(score.forbiddenHits).toEqual([])
  })
})

describe("gradeCase", () => {
  it("grades on the primary metric", () => {
    const green = scoreCase(["a"], judgements([["a", 1]]), 1)
    expect(gradeCase(green, thresholds)).toBe("green")

    const amber = scoreCase(["x", "a"], judgements([["a", 1]]), 2)
    // nDCG = (1/log2(3)) / 1 = 0.6309, between amber and green.
    expect(gradeCase(amber, thresholds)).toBe("amber")

    const red = scoreCase(["x", "y"], judgements([["a", 1]]), 2)
    expect(gradeCase(red, thresholds)).toBe("red")
  })

  it("forces red when a forbidden document appears", () => {
    const score = scoreCase(
      ["a", "banned"],
      judgements([["a", 1]]),
      2,
      ["banned"],
    )

    expect(score.ndcg).toBeCloseTo(1)
    expect(gradeCase(score, thresholds)).toBe("red")
  })

  it("respects a different primary metric", () => {
    const score = scoreCase(["a", "x"], judgements([["a", 1], ["b", 1]]), 2)

    expect(gradeCase(score, thresholds)).toBe("amber")
    expect(
      gradeCase(score, { metric: "recall", green: 0.8, amber: 0.5 }),
    ).toBe("amber")
    expect(
      gradeCase(score, { metric: "mrr", green: 0.8, amber: 0.5 }),
    ).toBe("green")
  })
})

describe("summariseScorecard", () => {
  it("averages each metric across cases and counts chips", () => {
    const perfect = scoreCase(["a"], judgements([["a", 1]]), 1)
    const missed = scoreCase(["x"], judgements([["a", 1]]), 1)
    const summary = summariseScorecard([perfect, missed], thresholds)

    expect(summary.cases).toBe(2)
    expect(summary.scored).toBe(2)
    expect(summary.precision).toBeCloseTo(0.5)
    expect(summary.ndcg).toBeCloseTo(0.5)
    expect(summary.mrr).toBeCloseTo(0.5)
    expect(summary.green).toBe(1)
    expect(summary.red).toBe(1)
    expect(summary.amber).toBe(0)
  })

  it("weights every case equally regardless of judgement count", () => {
    const smallPerfect = scoreCase(["a"], judgements([["a", 1]]), 1)
    const bigMiss = scoreCase(
      ["x", "y", "z"],
      judgements([["a", 1], ["b", 1], ["c", 1]]),
      3,
    )
    const summary = summariseScorecard([smallPerfect, bigMiss], thresholds)

    expect(summary.recall).toBeCloseTo(0.5)
  })

  it("counts cases that returned forbidden documents", () => {
    const score = scoreCase(
      ["banned"],
      judgements([["a", 1]]),
      1,
      ["banned"],
    )
    const summary = summariseScorecard([score], thresholds)

    expect(summary.forbidden).toBe(1)
    expect(summary.red).toBe(1)
  })

  it("returns zeroes for an empty run", () => {
    const summary = summariseScorecard([], thresholds)

    expect(summary.cases).toBe(0)
    expect(summary.ndcg).toBe(0)
  })
})

describe("metricValue", () => {
  it("reads each metric off a score", () => {
    const score = scoreCase(["x", "a"], judgements([["a", 1], ["b", 1]]), 2)

    expect(metricValue(score, "precision")).toBeCloseTo(0.5)
    expect(metricValue(score, "recall")).toBeCloseTo(0.5)
    expect(metricValue(score, "mrr")).toBeCloseTo(0.5)
    expect(metricValue(score, "ndcg")).toBeCloseTo(score.ndcg)
  })
})

describe("metricLabel", () => {
  it("adds the cut-off where it applies", () => {
    expect(metricLabel("precision", 20)).toBe("Precision@20")
    expect(metricLabel("recall", 5)).toBe("Recall@5")
    expect(metricLabel("ndcg", 10)).toBe("nDCG@10")
    expect(metricLabel("mrr", 10)).toBe("MRR")
  })
})
