import { type ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { createDataTableColumnHelper } from "./data-table-features.ts";
import { DataTable, DataTableRowActions } from "./data-table.tsx";

const columnHelper = createDataTableColumnHelper<{ name: string }>();
const columns = columnHelper.columns([
  columnHelper.accessor("name", { header: "Name" }),
]);

const actionColumns = columnHelper.columns([
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.display({
    id: "actions",
    cell: () => (
      <DataTableRowActions>
        <DropdownMenuItem>Open</DropdownMenuItem>
      </DataTableRowActions>
    ),
  }),
]);

function renderTable(
  ui: ReactElement,
  routes: { path: string; element: ReactElement }[] = [],
) {
  const router = createMemoryRouter([
    { path: "/", element: ui },
    ...routes,
  ]);
  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

describe("DataTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the table in a horizontally scrollable shell", () => {
    renderTable(
      <DataTable columns={columns} data={[{ name: "products" }]} />,
    );
    const table = screen.getByRole("table");
    expect(table.closest("[data-slot=table-container]")).toHaveClass(
      "min-w-0",
      "overflow-x-auto",
    );
    expect(table.closest(".min-w-0.max-w-full")).not.toBeNull();
  });

  it("renders an empty state when there are no rows", () => {
    renderTable(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("renders row values through TanStack column defs", () => {
    renderTable(
      <DataTable columns={columns} data={[{ name: "products" }]} />,
    );
    expect(screen.getByRole("columnheader", { name: "Name" }))
      .toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "products" })).toBeInTheDocument();
  });

  it("applies column meta className to cells, not headers", () => {
    const styledColumns = columnHelper.columns([
      columnHelper.accessor("name", {
        header: "Name",
        meta: { className: "max-w-xs truncate font-mono text-xs" },
      }),
    ]);
    renderTable(
      <DataTable columns={styledColumns} data={[{ name: "products" }]} />,
    );
    const header = screen.getByRole("columnheader", { name: "Name" });
    const cell = screen.getByRole("cell", { name: "products" });
    expect(header).not.toHaveClass(
      "font-mono",
      "text-xs",
      "truncate",
      "max-w-xs",
    );
    expect(cell).toHaveClass("font-mono", "text-xs", "truncate", "max-w-xs");
  });

  it("opens row actions without a section label", async () => {
    const user = userEvent.setup();
    renderTable(
      <DataTable columns={actionColumns} data={[{ name: "products" }]} />,
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByRole("menuitem", { name: "Open" }))
      .toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("navigates when a clickable row is activated", async () => {
    const user = userEvent.setup();
    const { router } = renderTable(
      <DataTable
        columns={columns}
        data={[{ name: "products" }]}
        getRowHref={(row) => `/indexes/${row.name}`}
      />,
      [{ path: "/indexes/:name", element: <p>schema page</p> }],
    );
    await user.click(screen.getByRole("cell", { name: "products" }));
    expect(router.state.location.pathname).toBe("/indexes/products");
    expect(screen.getByText("schema page")).toBeInTheDocument();
  });

  it("navigates when Enter is pressed on a clickable row", async () => {
    const user = userEvent.setup();
    const { router } = renderTable(
      <DataTable
        columns={columns}
        data={[{ name: "products" }]}
        getRowHref={(row) => `/indexes/${row.name}`}
      />,
      [{ path: "/indexes/:name", element: <p>schema page</p> }],
    );
    screen.getByRole("row", { name: /products/ }).focus();
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/indexes/products");
  });

  it("does not navigate when the row actions kebab is clicked", async () => {
    const user = userEvent.setup();
    const { router } = renderTable(
      <DataTable
        columns={actionColumns}
        data={[{ name: "products" }]}
        getRowHref={(row) => `/indexes/${row.name}`}
      />,
      [{ path: "/indexes/:name", element: <p>schema page</p> }],
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByRole("menuitem", { name: "Open" }))
      .toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText("schema page")).not.toBeInTheDocument();
  });

  it("calls onRowClick when a row is activated", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable(
      <DataTable
        columns={columns}
        data={[{ name: "products" }]}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByRole("cell", { name: "products" }));
    expect(onRowClick).toHaveBeenCalledWith({ name: "products" });
  });

  it("does not call onRowClick when the kebab is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable(
      <DataTable
        columns={actionColumns}
        data={[{ name: "products" }]}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByRole("menuitem", { name: "Open" }))
      .toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
