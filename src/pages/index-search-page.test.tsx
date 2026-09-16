import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { IndexSearchPage } from "./index-search-page.tsx"
import { usedExplanation } from "@/lib/aspected/explanation.ts"
import type { IndexDetail, SearchResultRow } from "@/lib/aspected/types.ts"
import { prettyJson } from "@/lib/pretty-json.ts"

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

const result: SearchResultRow = {
  id: "prod-001",
  distance: 0.12,
  explanation: [
    { name: "category", value: "electronics", distance: 0.05 },
    { name: "brand", value: "aurora" },
  ],
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

  it("opens an inspect sheet when a result row is clicked", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole("button", { name: "Search" }))
    await user.click(await screen.findByRole("cell", { name: "prod-001" }))

    const sheet = screen.getByRole("dialog")
    expect(within(sheet).getByRole("heading", { name: "prod-001" }))
      .toBeInTheDocument()
    expect(within(sheet).getByText("Search result detail.")).toBeInTheDocument()
    expect(within(sheet).getByLabelText("Distance")).toHaveValue("0.12")
    expect(within(sheet).getByText("Explanation")).toBeInTheDocument()
    expect(within(sheet).getByText("Document")).toBeInTheDocument()
    const editors = within(sheet).getAllByTestId("json-editor")
    expect(editors).toHaveLength(2)
    expect(editors[0]).toHaveAttribute("readonly")
    expect(editors[0]).toHaveValue(
      prettyJson(usedExplanation(result.explanation)),
    )
    expect(editors[1]).toHaveAttribute("readonly")
    expect(editors[1]).toHaveValue(prettyJson(result.doc))
  })

  it("shows an inline error when weight is not a number", async () => {
    const user = userEvent.setup()
    renderPage()
    const weightInputs = await screen.findAllByLabelText(/^weight$/i)
    await user.type(weightInputs[0], "abc")
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(
      await screen.findByText("Weight must be a number"),
    ).toBeInTheDocument()
    expect(weightInputs[0]).toHaveAttribute("aria-invalid", "true")
    expect(connection.client.searchIndex).not.toHaveBeenCalled()
  })

  it("shows an inline error when weight is out of range", async () => {
    const user = userEvent.setup()
    renderPage()
    const weightInputs = await screen.findAllByLabelText(/^weight$/i)
    await user.clear(weightInputs[0])
    await user.type(weightInputs[0], "10001")
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(
      await screen.findByText("Weight must be between 0 and 10000"),
    ).toBeInTheDocument()
    expect(connection.client.searchIndex).not.toHaveBeenCalled()
  })

  it("validates number aspects against min and max", async () => {
    const user = userEvent.setup()
    renderPage()
    const price = await screen.findByLabelText("price value")
    await user.clear(price)
    await user.type(price, "250")
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(
      await screen.findByText("Must be between 0 and 100"),
    ).toBeInTheDocument()
    expect(price).toHaveAttribute("aria-invalid", "true")
    expect(connection.client.searchIndex).not.toHaveBeenCalled()
  })

  it("shows a description for number aspects", async () => {
    renderPage()
    expect(
      await screen.findByText("Number between 0 and 100. Leave blank to omit."),
    ).toBeInTheDocument()
  })

  it("renders enum aspects as a select", async () => {
    renderPage()
    expect(
      await screen.findByRole("combobox", { name: "category value" }),
    ).toBeInTheDocument()
  })
})
