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
    wasConnected: false,
    retrying: false,
    nextRetryIn: null as number | null,
    activeId: null as string | null,
    statusReceivedAt: null as number | null,
    connections: [],
    upsertConnection: vi.fn(),
    deleteConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
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
    connection.wasConnected = false;
    connection.retrying = false;
    connection.nextRetryIn = null;
    connection.error = null;
    connection.connecting = false;
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
    connection.wasConnected = true;
    renderShell();
    expect(screen.getByRole("heading", { name: "Indexes" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Indexes" }).length)
      .toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Welcome to Aspected Studio" }),
    ).not.toBeInTheDocument();
  });

  describe("mid-session drop (wasConnected && !status)", () => {
    beforeEach(() => {
      connection.status = null;
      connection.wasConnected = true;
    });

    it("keeps the outlet mounted instead of showing the welcome screen", () => {
      renderShell();
      expect(screen.getByRole("heading", { name: "Indexes" }))
        .toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Welcome to Aspected Studio" }),
      ).not.toBeInTheDocument();
    });

    it("shows the disconnected overlay with server URL and reconnect button", () => {
      renderShell();
      expect(screen.getByRole("heading", { name: "Connection lost" }))
        .toBeInTheDocument();
      expect(screen.getByText("http://localhost:8080")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reconnect" }),
      ).toBeInTheDocument();
    });

    it("shows an error message when one is present", () => {
      connection.error = "Cannot reach Aspected";
      renderShell();
      expect(screen.getByText("Cannot reach Aspected")).toBeInTheDocument();
    });

    it("shows retry countdown when retrying", () => {
      connection.retrying = true;
      connection.nextRetryIn = 5;
      renderShell();
      expect(screen.getByText("Retrying in 5s...")).toBeInTheDocument();
    });

    it("shows reconnecting state while connecting", () => {
      connection.connecting = true;
      renderShell();
      expect(
        screen.getByRole("button", { name: "Reconnecting..." }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reconnecting..." }))
        .toBeDisabled();
    });

    it("calls reconnect when the Reconnect button is clicked", async () => {
      const { user } = await import("@testing-library/user-event").then((
        m,
      ) => ({ user: m.default.setup() }));
      renderShell();
      await user.click(screen.getByRole("button", { name: "Reconnect" }));
      expect(connection.reconnect).toHaveBeenCalledOnce();
    });
  });
});
