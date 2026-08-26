import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { IndexSchemaPage } from "./index-schema-page.tsx"
import type { IndexDetail } from "@/lib/aspected/types.ts"
import { docsUrl, INDEX_FIELD_DOCS } from "@/lib/docs.ts"

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
      multiplier: 1,
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
    [{ path: "/indexes/:name", element: <IndexSchemaPage /> }],
    { initialEntries: ["/indexes/products"] },
  )
  return render(<RouterProvider router={router} />)
}

describe("IndexSchemaPage", () => {
  beforeEach(() => {
    connection.client.getIndex.mockResolvedValue({ data: index })
  })

  afterEach(() => {
    cleanup()
    connection.client.getIndex.mockReset()
  })

  it("shows HNSW settings in a read-only JSON editor", async () => {
    renderPage()
    const editor = await screen.findByTestId("json-editor")
    expect(editor).toHaveAttribute("readonly")
    expect(editor).toHaveAttribute("aria-readonly", "true")
    expect(editor).toHaveValue(JSON.stringify(index.hnsw, null, 2))
    expect(document.querySelector("pre")).not.toBeInTheDocument()
  })

  it("links index property badges to field docs", async () => {
    renderPage()
    await screen.findByTestId("json-editor")
    expect(screen.getByText("16 dimensions")).toBeInTheDocument()
    expect(screen.getByText("ID size 36")).toBeInTheDocument()
    expect(screen.getByText("Cosine")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open docs: Index dimensions" }),
    ).toHaveAttribute("href", docsUrl(INDEX_FIELD_DOCS.numDims.page))
    expect(screen.getByRole("link", { name: "Open docs: ID size" }))
      .toHaveAttribute(
        "href",
        docsUrl(INDEX_FIELD_DOCS.idSize.page, INDEX_FIELD_DOCS.idSize.hash),
      )
    expect(screen.getByRole("link", { name: "Open docs: Distance" }))
      .toHaveAttribute("href", docsUrl(INDEX_FIELD_DOCS.distanceType.page))
  })

  it("opens HNSW docs from the page button, not a heading icon", async () => {
    renderPage()
    await screen.findByTestId("json-editor")
    expect(
      screen.queryByRole("link", { name: "Open docs: HNSW parameters" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "HNSW docs" })).toHaveAttribute(
      "href",
      docsUrl("hnsw"),
    )
    expect(screen.getByRole("button", { name: "Docs" })).toHaveAttribute(
      "href",
      docsUrl("resolvers"),
    )
  })
})
