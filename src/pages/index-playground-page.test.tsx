import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { IndexPlaygroundPage } from "./index-playground-page.tsx"
import { GOLDEN_SET_VERSION, saveGoldenSets } from "@/lib/aspected/golden.ts"
import type { IndexDetail, SearchResultRow } from "@/lib/aspected/types.ts"

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

/**
 * Two results that disagree and tie at equal weights, so any weight change
 * has to break the tie in a direction the test can predict.
 */
const results: SearchResultRow[] = [
  {
    id: "title-match",
    distance: 1,
    explanation: [
      { name: "title", value: "rake", distance: 0.1 },
      { name: "price", value: 90, distance: 0.9 },
    ],
  },
  {
    id: "price-match",
    distance: 1,
    explanation: [
      { name: "title", value: "hose", distance: 0.9 },
      { name: "price", value: 20, distance: 0.1 },
    ],
  },
]

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
    [{ path: "/indexes/:name/playground", element: <IndexPlaygroundPage /> }],
    { initialEntries: ["/indexes/products/playground"] },
  )
  return render(<RouterProvider router={router} />)
}

/**
 * Renders the page with auto-run switched off, so each test controls exactly
 * when the server is asked. Auto-run has its own test.
 */
async function setupManual() {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByLabelText("Auto-run searches"))
  return user
}

/** Document ids in the order the ranking table renders them. */
function rankedIds(): string[] {
  const table = screen.getByRole("table", { name: "Ranking" })
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[2].textContent ?? "")
}

/** Sets a weight directly, avoiding caret games on a controlled number field. */
function setWeight(aspect: string, weight: string) {
  fireEvent.change(screen.getByLabelText(`Weight for ${aspect}`), {
    target: { value: weight },
  })
}

/** Fills both aspect values so every result has a complete set of grades. */
async function fillQuery(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("title value"), "rake")
  await user.type(screen.getByLabelText("price value"), "20")
}

describe("IndexPlaygroundPage", () => {
  beforeEach(() => {
    connection.client.getIndex.mockResolvedValue({ data: index })
    connection.client.searchIndex.mockResolvedValue({ data: results })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    connection.client.getIndex.mockReset()
    connection.client.searchIndex.mockReset()
  })

  it("renders one control block per schema aspect", async () => {
    renderPage()

    expect(await screen.findByLabelText("Use title")).toBeInTheDocument()
    expect(screen.getByLabelText("Use price")).toBeInTheDocument()
    expect(screen.getByLabelText("title value")).toBeInTheDocument()
    expect(screen.getByLabelText("Weight for price")).toHaveValue(1)
  })

  it("requires a value before a search can run", async () => {
    renderPage()

    expect(await screen.findByRole("button", { name: "Run search" }))
      .toBeDisabled()
    expect(
      screen.getByText("Give at least one enabled aspect a value to search."),
    ).toBeInTheDocument()
  })

  it("sends the aspect values and weights it was given", async () => {
    const user = await setupManual()
    await fillQuery(user)
    setWeight("title", "4")
    await user.click(screen.getByRole("button", { name: "Run search" }))

    await waitFor(() => {
      expect(connection.client.searchIndex).toHaveBeenCalledWith("products", {
        k: 20,
        query: { title: "rake", price: 20 },
        weights: { title: 4, price: 1 },
        withDocs: true,
        withExplanation: true,
      })
    })
  })

  it("drops a disabled aspect from the request", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByLabelText("Use title"))
    await user.click(screen.getByRole("button", { name: "Run search" }))

    await waitFor(() => {
      expect(connection.client.searchIndex).toHaveBeenCalledWith("products", {
        k: 20,
        query: { price: 20 },
        weights: { price: 1 },
        withDocs: true,
        withExplanation: true,
      })
    })
  })

  it("re-orders locally when a weight changes, without a second search", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await screen.findByText("title-match")

    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)
    expect(rankedIds()).toEqual(["title-match", "price-match"])

    // Euclidean squares the weight, so 2 on price is a fourfold swing.
    setWeight("price", "2")

    expect(rankedIds()).toEqual(["price-match", "title-match"])
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)
  })

  it("keeps Move arrows after a weight change becomes Live", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await screen.findByText("title-match")

    setWeight("price", "2")
    expect(screen.getByText("Preview")).toBeInTheDocument()
    expect(rankedIds()).toEqual(["price-match", "title-match"])

    // Mock a Live response that already prefers price, as a real server would
    // under the new weights. The fixture explanations are not weight-aware.
    connection.client.searchIndex.mockResolvedValueOnce({
      data: [
        {
          id: "price-match",
          distance: 0.4,
          explanation: [
            { name: "title", value: "hose", distance: 3.6 },
            { name: "price", value: 20, distance: 0.4 },
          ],
        },
        {
          id: "title-match",
          distance: 1.6,
          explanation: [
            { name: "title", value: "rake", distance: 0.4 },
            { name: "price", value: 90, distance: 3.6 },
          ],
        },
      ],
    })

    await user.click(screen.getByRole("button", { name: "Run search" }))
    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument()
    })
    expect(rankedIds()).toEqual(["price-match", "title-match"])

    const table = screen.getByRole("table", { name: "Ranking" })
    const priceRow = within(table).getByText("price-match").closest("tr")
    expect(priceRow).not.toBeNull()
    const cells = within(priceRow as HTMLElement).getAllByRole("cell")
    // Rank #1, Move +1 vs the pre-tweak baseline where it sat at #2.
    expect(cells[0]).toHaveTextContent("1")
    expect(cells[1]).toHaveTextContent("1")
  })

  it("marks the ranking as a preview once weights drift from the run", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))

    expect(await screen.findByText("Live")).toBeInTheDocument()

    setWeight("title", "4")

    expect(screen.getByText("Preview")).toBeInTheDocument()
  })

  it("marks the ranking stale when the query itself changes", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await screen.findByText("Live")

    await user.type(screen.getByLabelText("title value"), " handle")

    expect(screen.getByText("Stale")).toBeInTheDocument()
  })

  it("shows the per-aspect split for a selected result", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await user.click(await screen.findByText("title-match"))

    const inspector = await screen.findByRole("table", {
      name: "Aspect contributions",
    })
    // Title contributes 0.1 of the 1.0 total at equal weights.
    expect(within(inspector).getByText("10.0%")).toBeInTheDocument()
    expect(within(inspector).getByText("90.0%")).toBeInTheDocument()
  })

  it("searches on its own when auto-run is left on", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText("title value"), "rake")

    await waitFor(() => {
      expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText("title-match")).toBeInTheDocument()
  })

  it("keeps Compare pinning unavailable until a search has run", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText("Use title")

    await user.click(screen.getByRole("tab", { name: "Compare" }))

    expect(screen.getByRole("button", { name: "Pin current as A" }))
      .toBeDisabled()
  })

  it("pins A, then compares a local weight change without a second search", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await screen.findByText("title-match")
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("tab", { name: "Compare" }))
    await user.click(screen.getByRole("button", { name: "Pin current as A" }))

    expect(await screen.findByText("A vs B")).toBeInTheDocument()

    setWeight("price", "2")

    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)
    expect(screen.getByText("price weight 1 to 2")).toBeInTheDocument()

    const movement = screen.getByRole("table", { name: "Movement" })
    const ids = within(movement)
      .getAllByRole("row")
      .slice(1)
      .map((row) => (row as HTMLTableRowElement).cells[3].textContent ?? "")
    expect(ids).toEqual(["price-match", "title-match"])
  })

  it("restores the pinned weights onto the form", async () => {
    const user = await setupManual()
    await fillQuery(user)
    await user.click(screen.getByRole("button", { name: "Run search" }))
    await screen.findByText("Live")

    await user.click(screen.getByRole("tab", { name: "Compare" }))
    await user.click(screen.getByRole("button", { name: "Pin current as A" }))

    setWeight("title", "4")
    expect(screen.getByLabelText("Weight for title")).toHaveValue(4)

    await user.click(screen.getByRole("button", { name: "Restore A" }))

    expect(screen.getByLabelText("Weight for title")).toHaveValue(1)
  })

  it("points the Scorecard tab at the page when no golden set exists", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText("Use title")

    await user.click(screen.getByRole("tab", { name: "Scorecard" }))

    expect(
      await screen.findByText("No golden set for this index yet.", {
        exact: false,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Create a golden set" }))
      .toHaveAttribute("href", "/indexes/products/scorecard")
  })

  it("grades a golden set and sweeps a weight without extra searches", async () => {
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

    const user = await setupManual()
    await user.click(screen.getByRole("tab", { name: "Scorecard" }))
    await user.click(
      await screen.findByRole("button", { name: "Run set" }, { timeout: 5000 }),
    )

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument()
    })
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)

    // `price-match` sits second at equal weights, so nDCG is 0.5 until the
    // sweep finds a better weight. The sweep defaults to the first schema
    // aspect (`title`); lowering it promotes `price-match` the same way
    // raising `price` would. Avoid opening the Base UI Select portal here:
    // jsdom sometimes never mounts its listbox options.
    const table = screen.getByRole("table", { name: "Case scores" })
    expect(within(table).getByText("amber")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Sweep aspect" }))
      .toHaveTextContent("title")

    const useBest = await screen.findByRole("button", { name: /Use best/ })
    expect(useBest).toHaveTextContent(/nDCG/)
    await user.click(useBest)

    await waitFor(() => {
      expect(within(table).getByText("green")).toBeInTheDocument()
    })
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)

    expect(screen.getByText(/Rank vs weight/)).toBeInTheDocument()
  })

  it("suggests weights, verifies with Run set, and can revert", async () => {
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

    const user = await setupManual()
    await user.click(screen.getByRole("tab", { name: "Scorecard" }))
    await user.click(
      await screen.findByRole("button", { name: "Run set" }, { timeout: 5000 }),
    )
    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument()
    })
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Quick suggest" }))

    expect(await screen.findByText(/Preview nDCG/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Apply preview" }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Verify with Run set" }))
      .toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Apply preview" }))

    await waitFor(() => {
      const title = screen.getByLabelText(
        "Weight for title",
      ) as HTMLInputElement
      const price = screen.getByLabelText(
        "Weight for price",
      ) as HTMLInputElement
      expect(
        Number(title.value) !== 1 || Number(price.value) !== 1,
      ).toBe(true)
    })

    await user.click(
      screen.getByRole("button", { name: "Verify with Run set" }),
    )
    await waitFor(() => {
      expect(connection.client.searchIndex.mock.calls.length).toBeGreaterThan(1)
    })
    await waitFor(() => {
      expect(screen.getByText(/Live after verify/)).toBeInTheDocument()
    })

    const titleBeforeRevert =
      (screen.getByLabelText("Weight for title") as HTMLInputElement).value
    await user.click(screen.getByRole("button", { name: "Revert" }))
    await waitFor(() => {
      expect(screen.getByLabelText("Weight for title")).toHaveValue(1)
      expect(screen.getByLabelText("Weight for price")).toHaveValue(1)
    })
    expect(titleBeforeRevert).not.toBe("1")
    expect(screen.queryByText(/Preview nDCG/)).not.toBeInTheDocument()
  })
})
