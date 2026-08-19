import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { CreateIndexPage } from "./create-index-page.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { docsUrl } from "@/lib/docs.ts";

const { connection } = vi.hoisted(() => ({
  connection: {
    client: {
      createIndex: vi.fn(),
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

function renderPage() {
  const router = createMemoryRouter(
    [{ path: "/indexes/new", element: <CreateIndexPage /> }],
    { initialEntries: ["/indexes/new"] },
  );
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
}

describe("CreateIndexPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes docs links for resolvers and JSONPath", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Docs" })).toHaveAttribute(
      "href",
      docsUrl("resolvers"),
    );
    expect(
      screen.getByRole("link", { name: "Open docs: JSONPath" }),
    ).toHaveAttribute(
      "href",
      docsUrl("resolvers", "jsonpath-expressions"),
    );
    expect(
      screen.getByRole("link", { name: "Open docs: enum resolver" }),
    ).toHaveAttribute("href", docsUrl("resolverEnum"));
  });

  it("shows an inline error when submitting with a blank index name", async () => {
    const user = userEvent.setup();
    renderPage();
    // Two "Name" fields exist (index and aspect); target by id
    const indexNameInput = document.getElementById(
      "index-name",
    ) as HTMLInputElement;
    await user.clear(indexNameInput);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText("Index name is required"),
    ).toBeInTheDocument();
    expect(connection.client.createIndex).not.toHaveBeenCalled();
  });

  it("shows an inline error when the index name contains invalid characters", async () => {
    const user = userEvent.setup();
    renderPage();
    const indexNameInput = document.getElementById(
      "index-name",
    ) as HTMLInputElement;
    await user.clear(indexNameInput);
    await user.type(indexNameInput, "my index!");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText(/only letters, digits/i),
    ).toBeInTheDocument();
    expect(connection.client.createIndex).not.toHaveBeenCalled();
  });
});
