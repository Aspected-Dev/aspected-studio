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
import { IndexScorecardPage } from "./index-scorecard-page.tsx"
import {
  GOLDEN_SET_VERSION,
  type GoldenSet,
  loadGoldenSets,
  saveGoldenSets,
} from "@/lib/aspected/golden.ts"
import { toast } from "sonner"
import type { IndexDetail, SearchResultRow } from "@/lib/aspected/types.ts"
import {
  TUNED_CONFIG_VERSION,
  upsertTunedConfig,
} from "@/lib/aspected/tuned-config.ts"

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

/** `good` leads on title, `other` is unjudged, `late` only matches on price. */
const results: SearchResultRow[] = [
  {
    id: "good",
    distance: 1.1,
    explanation: [
      { name: "title", value: "rake", distance: 0.1 },
      { name: "price", value: 30, distance: 1 },
    ],
  },
  {
    id: "other",
    distance: 1.2,
    explanation: [
      { name: "title", value: "hose", distance: 0.6 },
      { name: "price", value: 60, distance: 0.6 },
    ],
  },
  {
    id: "late",
    distance: 1.3,
    explanation: [
      { name: "title", value: "spade", distance: 1.2 },
      { name: "price", value: 31, distance: 0.1 },
    ],
  },
]

function goldenSet(overrides: Partial<GoldenSet> = {}): GoldenSet {
  return {
    version: GOLDEN_SET_VERSION,
    id: "set-1",
    name: "Garden set",
    indexName: "products",
    k: 3,
    thresholds: { metric: "ndcg", green: 0.8, amber: 0.5 },
    cases: [{
      id: "case-1",
      name: "rakes",
      aspects: [
        { name: "title", type: "text", enabled: true, value: "rake" },
        { name: "price", type: "number", enabled: true, value: "30" },
      ],
      expected: [{ id: "good", gain: 1 }],
      forbidden: [],
      k: null,
      notes: "",
      tags: [],
      enabled: true,
    }],
    updatedAt: 1,
    ...overrides,
  }
}

const { connection } = vi.hoisted(() => ({
  connection: {
    client: {
      getIndex: vi.fn(),
      searchIndex: vi.fn(),
      describeRequest: vi.fn(),
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

function renderPage(path = "/indexes/products/scorecard") {
  const router = createMemoryRouter(
    [{ path: "/indexes/:name/scorecard", element: <IndexScorecardPage /> }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

/**
 * Waits for the schema fetch and the stored sets to land before running.
 *
 * The default one-second window is not always enough for two effects plus a
 * full page render when the whole suite is running in parallel.
 */
function findRunButton() {
  return screen.findByRole("button", { name: "Run set" }, { timeout: 5000 })
}

describe("IndexScorecardPage", () => {
  beforeEach(() => {
    localStorage.clear()
    connection.client.getIndex.mockResolvedValue({ data: index })
    connection.client.searchIndex.mockResolvedValue({ data: results })
    connection.client.describeRequest.mockImplementation((
      path: string,
      options: { body?: unknown },
    ) => ({
      method: "POST",
      path,
      url: `http://localhost:8080${path}`,
      headers: {},
      body: options.body,
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("offers to import when the index has no golden set", async () => {
    renderPage()

    expect(
      await screen.findByText("No golden set for this index yet."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Import one/ }))
      .toBeInTheDocument()
  })

  it("seeds the import sheet editor with a stub when opened", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: /Import one/ }),
    )

    expect(
      await screen.findByRole("heading", { name: "Import a golden set" }),
    ).toBeInTheDocument()
    // Stub is non-empty, so Import is enabled (controlled opens do not use
    // Sheet onOpenChange, so seeding must happen on the button click).
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Import",
      }),
    ).toBeEnabled()
  })

  it("renders a help icon for every metric tile", async () => {
    saveGoldenSets([goldenSet()])
    renderPage()

    expect(
      await screen.findByRole(
        "button",
        { name: "About Precision@3" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About Recall@3" }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About MRR" }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About nDCG@3" }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About MAP" }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About case chips" }))
      .toBeInTheDocument()
  })

  it("runs the set and grades each case", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    await user.click(await findRunButton())

    await waitFor(() => {
      expect(connection.client.searchIndex).toHaveBeenCalledWith("products", {
        k: 3,
        query: { title: "rake", price: 30 },
        withDocs: false,
        withExplanation: true,
        weights: { title: 1, price: 1 },
      })
    })

    const table = await screen.findByRole("table", { name: "Case scores" })
    await waitFor(() => {
      expect(within(table).getByText("green")).toBeInTheDocument()
    })
    expect(screen.getByText("1 of 1 case graded.")).toBeInTheDocument()
  })

  it("re-grades locally and flags a preview when a weight changes", async () => {
    saveGoldenSets([
      goldenSet({
        cases: [{
          ...goldenSet().cases[0],
          expected: [{ id: "late", gain: 1 }],
        }],
      }),
    ])
    const user = userEvent.setup()
    renderPage()

    await user.click(await findRunButton())
    const table = await screen.findByRole("table", { name: "Case scores" })
    // `late` lands at rank 3, so nDCG is 0.5: amber, not green.
    await waitFor(() => {
      expect(within(table).getByText("amber")).toBeInTheDocument()
    })

    // Leaning on price promotes `late` to rank 1 without another request.
    fireEvent.change(screen.getByLabelText("Weight for price"), {
      target: { value: "100" },
    })

    await waitFor(() => {
      expect(within(table).getByText("green")).toBeInTheDocument()
    })
    expect(screen.getByText("Preview")).toBeInTheDocument()
    expect(connection.client.searchIndex).toHaveBeenCalledTimes(1)
  })

  it("marks an unjudged result as relevant from the results list", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    await user.click(await findRunButton())
    await user.click(
      await screen.findByRole("button", { name: /rakes: green/ }),
    )

    const markButtons = await screen.findAllByRole("button", {
      name: "Mark relevant",
    })
    expect(markButtons).toHaveLength(2)
    await user.click(markButtons[0])

    await waitFor(() => {
      expect(screen.getByLabelText("Gain for other")).toBeInTheDocument()
    })
  })

  it("creates an unnamed set and puts the cursor in the name field", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "New" }, { timeout: 5000 }),
    )

    const field = await screen.findByLabelText("Set name")
    expect(field).toHaveValue("")
    expect(field).toHaveAttribute("placeholder", "Untitled set")
    await waitFor(() => {
      expect(field).toHaveFocus()
    })
    expect(screen.getByRole("combobox", { name: "Golden set" }))
      .toHaveTextContent("Untitled set")
    expect(toast.success).toHaveBeenCalledWith(
      "Golden set created",
      expect.anything(),
    )
  })

  it("keeps a rename out of storage until the field is committed", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    const field = await screen.findByLabelText("Set name")
    await user.clear(field)
    await user.type(field, "Tools")
    expect(loadGoldenSets()[0].name).toBe("Garden set")

    await user.tab()
    await waitFor(() => {
      expect(loadGoldenSets()[0].name).toBe("Tools")
    })
  })

  it("duplicates the set and drops the previous run", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    await user.click(await findRunButton())
    const table = await screen.findByRole("table", { name: "Case scores" })
    await waitFor(() => {
      expect(within(table).getByText("green")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    expect(toast.success).toHaveBeenCalledWith(
      "Duplicated Garden set",
      expect.anything(),
    )
    await waitFor(() => {
      expect(screen.getByText("Not run yet.")).toBeInTheDocument()
    })
    expect(loadGoldenSets()).toHaveLength(2)
    expect(loadGoldenSets()[1].name).toBe("Garden set copy")
  })

  it("confirms before deleting the set", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", { name: "Delete" }, { timeout: 5000 }),
    )

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(/Garden set/)).toBeInTheDocument()
    expect(loadGoldenSets()).toHaveLength(1)

    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(loadGoldenSets()).toEqual([])
    })
    expect(toast.success).toHaveBeenCalledWith("Deleted Garden set")
  })

  it("confirms before deleting a case", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 })
    renderPage()

    await user.click(await findRunButton())
    await user.click(
      await screen.findByRole("button", { name: /rakes: green/ }),
    )
    await user.click(screen.getByRole("button", { name: "Delete case" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(/rakes/)).toBeInTheDocument()
    expect(loadGoldenSets()[0].cases).toHaveLength(1)

    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(loadGoldenSets()[0].cases).toEqual([])
    })
    expect(toast.success).toHaveBeenCalledWith("Deleted rakes")
  })

  it("shows the request for the selected case", async () => {
    saveGoldenSets([goldenSet()])
    const user = userEvent.setup()
    renderPage()

    await user.click(await findRunButton())
    await user.click(
      await screen.findByRole("button", { name: /rakes: green/ }),
    )

    expect(
      await screen.findByText("/indexes/products/search"),
    ).toBeInTheDocument()
  })

  it("loads tuned weights from ?loadTuned= and clears the param", async () => {
    saveGoldenSets([goldenSet()])
    upsertTunedConfig({
      version: TUNED_CONFIG_VERSION,
      id: "tuned-1",
      name: "Products champion",
      indexName: "products",
      goldenSetId: "set-1",
      goldenSetName: "Garden set",
      weights: { title: 2.5, price: 0.4 },
      fetchK: 20,
      primaryMetric: "ndcg",
      trainPrimary: 0.9,
      holdoutPrimary: 0.88,
      objectiveValue: 0.9,
      noiseFloor: 0.002,
      rationale: ["title: 1 → 2.5."],
      createdAt: 1,
      holdoutSeed: 42,
    })

    const router = createMemoryRouter(
      [{ path: "/indexes/:name/scorecard", element: <IndexScorecardPage /> }],
      { initialEntries: ["/indexes/products/scorecard?loadTuned=tuned-1"] },
    )
    render(<RouterProvider router={router} />)

    await findRunButton()

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Weights loaded. Run set to verify.",
      )
    })
    expect(router.state.location.search).not.toContain("loadTuned")

    const titleWeight = screen.getByLabelText("Weight for title")
    expect(titleWeight).toHaveValue(2.5)
  })
})
