import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppShell } from "./app-shell.tsx";
import type { StatusResponse } from "@/lib/aspected/types.ts";

const statusResponse: StatusResponse = {
  version: "0.4.1",
  uptime: "1s",
  config: {
    corsEnabled: false,
    httpsEnabled: false,
    tokenAuthEnabled: false,
  },
};

const { connection } = vi.hoisted(() => ({
  connection: {
    settings: { baseUrl: "http://localhost:8080", apiToken: "" },
    client: {},
    status: null as StatusResponse | null,
    error: null as string | null,
    connecting: false,
    activeId: null as string | null,
    statusReceivedAt: null as number | null,
    connections: [],
    upsertConnection: vi.fn(),
    deleteConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}));

vi.mock("@/components/ui/sonner.tsx", () => ({
  Toaster: () => null,
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

function renderShell() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <h1>Indexes</h1> },
      ],
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    connection.status = null;
  });

  it("shows Welcome instead of Indexes while disconnected", () => {
    renderShell();
    expect(
      screen.getByRole("heading", { name: "Welcome to Aspected Studio" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Indexes" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Indexes" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
  });

  it("renders the outlet and index nav after connect", () => {
    connection.status = statusResponse;
    renderShell();
    expect(screen.getByRole("heading", { name: "Indexes" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Indexes" }).length)
      .toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Welcome to Aspected Studio" }),
    ).not.toBeInTheDocument();
  });
});
