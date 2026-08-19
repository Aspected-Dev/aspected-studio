import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { IndexesPage } from "./indexes-page.tsx";
import { indexPath, indexStudioUrl } from "@/lib/app-nav.ts";
import { indexUrlForCopy } from "@/lib/aspected/connection.ts";
import { buildCurlCommand } from "@/lib/aspected/curl.ts";
import { docsUrl } from "@/lib/docs.ts";

const { connection, copyToClipboard } = vi.hoisted(() => {
  const listIndexes = vi.fn();
  const deleteIndex = vi.fn();
  return {
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    connection: {
      settings: {
        baseUrl: "http://localhost:8080",
        apiToken: "secret",
      },
      client: {
        listIndexes,
        deleteIndex,
      },
      status: null,
      error: null,
      connecting: false,
      activeId: null,
      statusReceivedAt: null,
      connections: [],
      upsertConnection: vi.fn(),
      deleteConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}));

vi.mock("@/lib/utils.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils.ts")>();
  return {
    ...actual,
    copyToClipboard,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

function renderPage() {
  const router = createMemoryRouter([
    { path: "/", element: <IndexesPage /> },
    { path: "/indexes/:name", element: <p>schema page</p> },
    { path: "/indexes/:name/docs", element: <p>docs page</p> },
    { path: "/indexes/:name/search", element: <p>search page</p> },
  ]);
  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

async function openRowMenu() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open menu" }));
  return user;
}

describe("IndexesPage", () => {
  beforeEach(() => {
    connection.client.listIndexes.mockResolvedValue({
      data: [{ name: "products" }],
    });
    connection.client.deleteIndex.mockResolvedValue({
      data: { deleted: true },
    });
  });

  afterEach(() => {
    cleanup();
    copyToClipboard.mockClear();
    connection.client.listIndexes.mockReset();
    connection.client.deleteIndex.mockReset();
    vi.mocked(toast.success).mockClear();
  });

  it("lists index names from the client", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "products" }))
      .toHaveAttribute("href", indexPath("products"));
  });

  it("points an empty list at the tutorial", async () => {
    connection.client.listIndexes.mockResolvedValue({ data: [] });
    renderPage();
    expect(
      await screen.findByText("No indexes on this server yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tutorial" })).toHaveAttribute(
      "href",
      docsUrl("tutorial"),
    );
  });

  it("shows navigate, copy, and delete actions without a section label", async () => {
    renderPage();
    await openRowMenu();

    expect(await screen.findByRole("menuitem", { name: "Schema" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Documents" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Search" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy name" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Studio URL" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy API URL" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy GET curl" }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Open" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("navigates to schema from the row menu", async () => {
    const { router } = renderPage();
    const user = await openRowMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Schema" }));
    expect(router.state.location.pathname).toBe(indexPath("products"));
    expect(screen.getByText("schema page")).toBeInTheDocument();
  });

  it("navigates to documents from the row menu", async () => {
    renderPage();
    const user = await openRowMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Documents" }),
    );
    expect(screen.getByText("docs page")).toBeInTheDocument();
  });

  it("navigates to search from the row menu", async () => {
    renderPage();
    const user = await openRowMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Search" }));
    expect(screen.getByText("search page")).toBeInTheDocument();
  });

  it("copies the name, Studio URL, API URL, and GET curl without a token", async () => {
    renderPage();
    const apiUrl = indexUrlForCopy("http://localhost:8080", "products");
    const studioUrl = indexStudioUrl(window.location.origin, "products");
    const curl = buildCurlCommand({ method: "GET", url: apiUrl });

    let user = await openRowMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Copy name" }),
    );
    expect(copyToClipboard).toHaveBeenCalledWith("products");
    expect(toast.success).toHaveBeenCalledWith("Copied index name");

    user = await openRowMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Copy Studio URL" }),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(studioUrl);
    expect(toast.success).toHaveBeenCalledWith("Copied Studio URL");

    user = await openRowMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Copy API URL" }),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(apiUrl);
    expect(toast.success).toHaveBeenCalledWith("Copied API URL");
    expect(apiUrl).not.toContain("secret");

    user = await openRowMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Copy GET curl" }),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(curl);
    expect(toast.success).toHaveBeenCalledWith("Copied curl");
    expect(curl).not.toContain("secret");
    expect(curl).not.toContain("Authorization");
  });

  it("confirms delete before calling the API", async () => {
    renderPage();
    const user = await openRowMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Delete index" }))
      .toBeInTheDocument();
    expect(connection.client.deleteIndex).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(connection.client.deleteIndex).toHaveBeenCalledWith("products");
    expect(toast.success).toHaveBeenCalledWith("Deleted products");
  });
});
