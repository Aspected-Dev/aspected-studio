import { describe, expect, it } from "vitest"
import {
  activeCaseAspects,
  buildCaseRequest,
  type CaseRun,
  caseScoringWeights,
  caseSignature,
  runnableCases,
  scoreRunAsReturned,
  scoreRunAtWeights,
  scoreSet,
} from "./scorecard.ts"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
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
    expected: [{ id: "a", gain: 1 }, { id: "b", gain: 1 }],
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

/** Rows where title dominates: `a` matches the title, `b` matches the price. */
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

describe("activeCaseAspects", () => {
  it("drops disabled rows, blank values, and zeroed weights", () => {
    const item = testCase({
      aspects: [
        { name: "title", type: "text", enabled: true, value: "rake" },
        { name: "price", type: "number", enabled: false, value: "30" },
        { name: "blank", type: "text", enabled: true, value: "  " },
        { name: "zeroed", type: "text", enabled: true, value: "x" },
      ],
    })

    expect(
      activeCaseAspects(item, { zeroed: 0 }).map((aspect) => aspect.name),
    ).toEqual(["title"])
  })
})

describe("caseScoringWeights", () => {
  it("pins aspects that are not queried to zero", () => {
    const item = testCase({
      aspects: [
        { name: "title", type: "text", enabled: true, value: "rake" },
        { name: "price", type: "number", enabled: false, value: "30" },
      ],
    })

    expect(caseScoringWeights(item, { title: 4, price: 2 })).toEqual({
      title: 4,
      price: 0,
    })
  })
})

describe("buildCaseRequest", () => {
  it("asks for explanations, skips documents, and sends active weights", () => {
    const request = buildCaseRequest(testCase(), { title: 4 }, 5)

    expect(request).toEqual({
      k: 5,
      query: { title: "rake", price: 30 },
      withDocs: false,
      withExplanation: true,
      weights: { title: 4, price: 1 },
    })
  })

  it("omits weights when nothing is queried", () => {
    const item = testCase({
      aspects: [{ name: "title", type: "text", enabled: false, value: "rake" }],
    })

    expect(buildCaseRequest(item, {}, 5)).toEqual({
      k: 5,
      query: {},
      withDocs: false,
      withExplanation: true,
    })
  })

  it("throws when a value cannot be coerced for its resolver", () => {
    const item = testCase({
      aspects: [{
        name: "price",
        type: "number",
        enabled: true,
        value: "cheap",
      }],
    })

    expect(() => buildCaseRequest(item, {}, 5)).toThrow(SyntaxError)
  })
})

describe("caseSignature", () => {
  it("changes when the weights change", () => {
    const item = testCase()

    expect(caseSignature(item, { title: 1 }, 5)).not.toBe(
      caseSignature(item, { title: 4 }, 5),
    )
    expect(caseSignature(item, { title: 1 }, 5)).toBe(
      caseSignature(item, { title: 1 }, 5),
    )
  })

  it("changes when k changes", () => {
    const item = testCase()

    expect(caseSignature(item, {}, 5)).not.toBe(caseSignature(item, {}, 10))
  })

  it("stays stable for a case that cannot be built", () => {
    const item = testCase({
      aspects: [{ name: "price", type: "number", enabled: true, value: "no" }],
    })

    expect(caseSignature(item, {}, 5)).toBe("invalid:case-1")
  })
})

describe("runnableCases", () => {
  it("keeps enabled cases that have something to query", () => {
    const queryable = testCase({ id: "keep" })
    const disabled = testCase({ id: "off", enabled: false })
    const empty = testCase({
      id: "empty",
      aspects: [{ name: "title", type: "text", enabled: true, value: "" }],
    })

    expect(
      runnableCases(set([queryable, disabled, empty]), {}).map((item) =>
        item.id
      ),
    ).toEqual(["keep"])
  })
})

describe("scoreRunAsReturned", () => {
  it("grades the ranking the server produced", () => {
    const score = scoreRunAsReturned(run(), testCase(), 3)

    expect(score.hits).toBe(2)
    expect(score.firstRelevantRank).toBe(1)
    expect(score.unexpected).toEqual(["x"])
  })

  it("reports the failure copy through scoreSet instead of a score", () => {
    const scored = scoreSet(
      set([testCase()]),
      new Map([["case-1", run({ error: "Index not found" })]]),
    )

    expect(scored[0].score).toBeNull()
    expect(scored[0].error).toBe("Index not found")
  })
})

describe("scoreRunAtWeights", () => {
  it("re-grades cached rows without a request", () => {
    const item = testCase({ expected: [{ id: "b", gain: 1 }] })

    const atTitle = scoreRunAtWeights(
      run(),
      item,
      "Euclidean",
      { title: 100, price: 1 },
      {},
      3,
    )
    const atPrice = scoreRunAtWeights(
      run(),
      item,
      "Euclidean",
      { title: 1, price: 100 },
      {},
      3,
    )

    // `b` only matches on price, so leaning on price should promote it.
    expect(atPrice.firstRelevantRank).toBe(1)
    expect(atTitle.firstRelevantRank).toBe(3)
    expect(atPrice.ndcg).toBeGreaterThan(atTitle.ndcg)
  })

  it("matches the server ordering when the weights are unchanged", () => {
    const item = testCase()
    const preview = scoreRunAtWeights(
      run(),
      item,
      "Euclidean",
      { title: 1, price: 1 },
      {},
      3,
    )

    expect(preview.ndcg).toBeCloseTo(scoreRunAsReturned(run(), item, 3).ndcg)
  })
})

describe("scoreSet", () => {
  it("leaves cases without a run unscored", () => {
    const scored = scoreSet(
      set([testCase(), testCase({ id: "case-2" })]),
      new Map(),
    )

    expect(scored).toHaveLength(2)
    expect(scored.every((entry) => entry.score === null)).toBe(true)
  })

  it("honours a per-case k override", () => {
    const scored = scoreSet(
      set([testCase({ k: 1 })]),
      new Map([["case-1", run()]]),
    )

    expect(scored[0].score?.k).toBe(1)
    expect(scored[0].score?.hits).toBe(1)
  })

  it("uses candidate weights when a metric and schema are supplied", () => {
    const item = testCase({ expected: [{ id: "b", gain: 1 }] })
    const scored = scoreSet(
      set([item]),
      new Map([["case-1", run()]]),
      {
        metric: "Euclidean",
        weights: { title: 1, price: 100 },
        schema,
      },
    )

    expect(scored[0].score?.firstRelevantRank).toBe(1)
  })
})
