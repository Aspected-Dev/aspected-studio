import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { IndexDocsPage } from "./index-docs-page.tsx";
import type { DocEntry, IndexDetail } from "@/lib/aspected/types.ts";

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
};

const doc: DocEntry = {
  id: "prod-001",
  doc: { category: "electronics" },
  accessList: ["team-a"],
};

const { connection } = vi.hoisted(() => ({
  connection: {
    client: {
      getIndex: vi.fn(),
      listDocs: vi.fn(),
      uploadDocs: vi.fn(),
      lastRequest: null,
    },
  },
}));

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

function renderPage() {
  const router = createMemoryRouter(
    [{ path: "/indexes/:name/docs", element: <IndexDocsPage /> }],
    { initialEntries: ["/indexes/products/docs"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("IndexDocsPage", () => {
  beforeEach(() => {
    connection.client.getIndex.mockResolvedValue({ data: index });
    connection.client.listDocs.mockResolvedValue({
      data: [doc],
      total: 1,
      page: 1,
      limit: 10,
    });
  });

  afterEach(() => {
    cleanup();
    connection.client.getIndex.mockReset();
    connection.client.listDocs.mockReset();
    connection.client.uploadDocs.mockReset();
    vi.mocked(toast.success).mockClear();
  });

  it("shows the selected document in a read-only JSON editor", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("cell", { name: "prod-001" }));

    const editor = screen.getAllByTestId("json-editor").find((element) =>
      element.getAttribute("readonly") !== null
    );
    expect(editor).toBeDefined();
    expect(editor).toHaveValue(JSON.stringify(doc, null, 2));
    expect(document.querySelector("pre")).not.toBeInTheDocument();
  });

  it("opens bulk upload with pretty-printed example JSON", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Bulk JSON" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Bulk upload");
    const editor = dialog.querySelector('[data-testid="json-editor"]');
    expect(editor).toHaveValue(JSON.stringify(
      {
        data: [
          {
            id: "prod-001",
            doc: {
              category: "electronics",
            },
          },
        ],
      },
      null,
      2,
    ));
  });

  it("confirms delete before removing a document", async () => {
    connection.client.uploadDocs.mockResolvedValue({
      data: { created: [], updated: [], deleted: ["prod-001"] },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByRole("heading", { name: "Delete document" }))
      .toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This removes prod-001 from products. This cannot be undone.",
    );
    expect(connection.client.uploadDocs).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(connection.client.uploadDocs).toHaveBeenCalledWith("products", {
      data: [{ id: "prod-001" }],
      policy: { missing: "Ignore" },
    });
    expect(toast.success).toHaveBeenCalledWith("Deleted prod-001");
  });
});
