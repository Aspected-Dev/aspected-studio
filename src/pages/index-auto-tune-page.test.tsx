import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { IndexAutoTunePage } from "./index-auto-tune-page.tsx"
import { GOLDEN_SET_VERSION, saveGoldenSets } from "@/lib/aspected/golden.ts"
import type { IndexDetail } from "@/lib/aspected/types.ts"

const index: IndexDetail = {
  name: "products",
  idSize: 36,
  numDims: 16,
  distanceType: "Euclidean",
  schema: [
    {
      name: "title",
      type: "text",
      path: "$.title",
      settings: { model: "minilm" },
    },
    {
      name: "price",
      type: "number",
      path: "$.price",
      settings: { min: 0, max: 100 },
    },
  ],
  hnsw: {
    M: 16,
    Mmax: 16,
    Mmax0: 32,
    mL: 0.36,
    efConstruction: 200,
    efSearch: 50,
    extendCandidates: false,
    keepPrunedConnections: false,
    maxStoreSize: 1000,
  },
}

const { connection } = vi.hoisted(() => ({
  connection: {
    client: {
      getIndex: vi.fn(),
      searchIndex: vi.fn(),
      lastRequest: null,
    },
  },
}))

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderPage() {
  const router = createMemoryRouter(
    [{ path: "/indexes/:name/auto-tune", element: <IndexAutoTunePage /> }],
    { initialEntries: ["/indexes/products/auto-tune"] },
  )
  return render(<RouterProvider router={router} />)
}

describe("IndexAutoTunePage", () => {
  beforeEach(() => {
    localStorage.clear()
    connection.client.getIndex.mockResolvedValue({ data: index })
    connection.client.searchIndex.mockImplementation(
      (
        _name: string,
        body: { weights?: Record<string, number> },
      ) => {
        const price = body.weights?.price ?? 1
        return Promise.resolve({
          data: price >= 2
            ? [
              { id: "price-match", distance: 0.1 },
              { id: "title-match", distance: 0.9 },
            ]
            : [
              { id: "title-match", distance: 0.1 },
              { id: "price-match", distance: 0.9 },
            ],
        })
      },
    )
  })

  afterEach(() => {
    cleanup()
  })

  it("shows an empty state when no golden set exists", async () => {
    renderPage()
    expect(
      await screen.findByText(/No golden set for this index yet/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open Scorecard" }))
      .toHaveAttribute("href", "/indexes/products/scorecard")
  })

  it("starts a small run, shows progress, and saves a champion", async () => {
    saveGoldenSets([{
      version: GOLDEN_SET_VERSION,
      id: "set-1",
      name: "Garden set",
      indexName: "products",
      k: 2,
      thresholds: { metric: "ndcg", green: 0.8, amber: 0.5 },
      cases: [{
        id: "case-1",
        name: "rakes",
        aspects: [
          { name: "title", type: "text", enabled: true, value: "rake" },
          { name: "price", type: "number", enabled: true, value: "20" },
        ],
        expected: [{ id: "price-match", gain: 1 }],
        forbidden: [],
        k: null,
        notes: "",
        tags: [],
        enabled: true,
      }],
      updatedAt: 1,
    }])

    const user = userEvent.setup()
    renderPage()

    const start = await screen.findByRole("button", {
      name: "Start auto-tune",
    }, { timeout: 5000 })
    await user.click(start)

    await waitFor(() => {
      expect(screen.getByText("Progress")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText("Results")).toBeInTheDocument()
    }, { timeout: 15000 })

    expect(screen.getByRole("button", { name: "Apply champion" }))
      .toBeInTheDocument()
    expect(connection.client.searchIndex.mock.calls.length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(screen.getByText(/Saved configs/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Garden set/i).length).toBeGreaterThan(0)
    })
  })
})
