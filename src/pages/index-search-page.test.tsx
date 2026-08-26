import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { IndexSearchPage } from "./index-search-page.tsx"
import type { IndexDetail, SearchResultRow } from "@/lib/aspected/types.ts"

const index: IndexDetail = {
  name: "products",
  idSize: 36,
  numDims: 16,
  distanceType: "Cosine",
  schema: [
    {
      name: "category",
      type: "enum",
      path: "$.category",
      settings: { values: ["electronics"] },
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

const result: SearchResultRow = {
  id: "prod-001",
  distance: 0.12,
  doc: { category: "electronics" },
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
    [{ path: "/indexes/:name/search", element: <IndexSearchPage /> }],
    { initialEntries: ["/indexes/products/search"] },
  )
  return render(<RouterProvider router={router} />)
}

describe("IndexSearchPage", () => {
  beforeEach(() => {
    connection.client.getIndex.mockResolvedValue({ data: index })
    connection.client.searchIndex.mockResolvedValue({ data: [result] })
  })

  afterEach(() => {
    cleanup()
    connection.client.getIndex.mockReset()
    connection.client.searchIndex.mockReset()
  })

  it("shows a selected result in a read-only JSON editor", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Search" }))
    await user.click(await screen.findByRole("cell", { name: "prod-001" }))

    const editor = screen.getByTestId("json-editor")
    expect(editor).toHaveAttribute("readonly")
    expect(editor).toHaveValue(JSON.stringify(result, null, 2))
  })

  it("shows an inline error when weight is not a number", async () => {
    const user = userEvent.setup()
    renderPage()
    // Wait for aspects to load from the mock index, then find the weight input by its label
    const weightInput = await screen.findByLabelText(/^weight$/i)
    await user.type(weightInput, "abc")
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(
      await screen.findByText("Weight must be a number"),
    ).toBeInTheDocument()
    expect(connection.client.searchIndex).not.toHaveBeenCalled()
  })
})
