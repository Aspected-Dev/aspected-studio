import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAutoTune } from "./use-auto-tune.ts"
import { emptyGoldenSet } from "@/lib/aspected/golden.ts"
import type { GoldenCase } from "@/lib/aspected/golden.ts"
import { defaultTuneSpace } from "@/lib/aspected/tuner.ts"
import type { StoredAspect } from "@/lib/aspected/types.ts"

const schema = [
  { name: "title", type: "text" },
  { name: "price", type: "number" },
] as StoredAspect[]

const { connection } = vi.hoisted(() => ({
  connection: {
    client: {
      searchIndex: vi.fn(),
    },
  },
}))

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

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

describe("useAutoTune", () => {
  beforeEach(() => {
    connection.client.searchIndex.mockReset()
    connection.client.searchIndex.mockImplementation(
      (
        _name: string,
        body: { weights?: Record<string, number> },
      ) => {
        const price = body.weights?.price ?? 1
        const rows = price >= 2
          ? [
            { id: "b", distance: 0.1 },
            { id: "a", distance: 0.9 },
          ]
          : [
            { id: "a", distance: 0.1 },
            { id: "b", distance: 0.9 },
          ]
        return Promise.resolve({ data: rows })
      },
    )
  })

  it("runs Live trials, reuses the signature cache, and keeps a champion", async () => {
    const set = {
      ...emptyGoldenSet("catalog", schema),
      k: 2,
      cases: [testCase()],
    }
    const start = { weights: { title: 1, price: 1 }, fetchK: 2 }
    const { result } = renderHook(() => useAutoTune("catalog"))

    await act(async () => {
      await result.current.start({
        set,
        start,
        space: defaultTuneSpace(set, start.weights),
        maxSearches: 40,
        useHoldout: false,
        concurrency: 2,
      })
    })

    await waitFor(() => {
      expect(result.current.running).toBe(false)
      expect(result.current.stage).toBe("done")
    })

    expect(result.current.champion).not.toBeNull()
    expect(result.current.trials.length).toBeGreaterThan(2)
    expect(result.current.progress.cacheMisses).toBeGreaterThan(0)
    // Revisiting configs or shared case signatures should produce hits.
    expect(
      result.current.progress.cacheHits + result.current.progress.cacheMisses,
    ).toBeGreaterThan(result.current.progress.cacheMisses)
    const calls = connection.client.searchIndex.mock.calls.length
    expect(calls).toBe(result.current.progress.cacheMisses)
    expect(calls).toBeLessThanOrEqual(40)
  })

  it("stops and preserves best-so-far", async () => {
    connection.client.searchIndex.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: [
                { id: "b", distance: 0.1 },
                { id: "a", distance: 0.9 },
              ],
            })
          }, 30)
        }),
    )

    const set = {
      ...emptyGoldenSet("catalog", schema),
      k: 2,
      cases: [testCase()],
    }
    const start = { weights: { title: 1, price: 1 }, fetchK: 2 }
    const { result } = renderHook(() => useAutoTune("catalog"))

    let started: Promise<void>
    act(() => {
      started = result.current.start({
        set,
        start,
        space: defaultTuneSpace(set, start.weights),
        maxSearches: 200,
        useHoldout: false,
      })
    })

    await waitFor(() => {
      expect(result.current.trials.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.stop()
    })

    await act(async () => {
      await started!
    })

    expect(result.current.running).toBe(false)
    expect(result.current.stopped).toBe(true)
    expect(result.current.champion).not.toBeNull()
  })
})
