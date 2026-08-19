import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionProvider, useConnection } from "@/hooks/use-connection.tsx";
import type { ConnectionSettings } from "@/lib/aspected/connection.ts";
import {
  CONNECTIONS_STORAGE_KEY,
  DEFAULT_BASE_URL,
} from "@/lib/aspected/connection.ts";
import type { StatusResponse } from "@/lib/aspected/types.ts";

const statusResponse: StatusResponse = {
  version: "0.4.1",
  uptime: "0w 0d 0h 1m 2s",
  config: {
    corsEnabled: false,
    httpsEnabled: false,
    tokenAuthEnabled: true,
  },
};

const { getStatus } = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock("@/lib/aspected/client.ts", () => ({
  AspectedClient: class {
    constructor(public connection: ConnectionSettings) {}
    getStatus = getStatus;
  },
}));

function Probe() {
  const connection = useConnection();
  return (
    <div>
      <span data-testid="connecting">{String(connection.connecting)}</span>
      <span data-testid="status">{connection.status?.version ?? "none"}</span>
      <span data-testid="active">{connection.activeId ?? "none"}</span>
      <span data-testid="count">{connection.connections.length}</span>
      <button
        type="button"
        onClick={() =>
          connection.upsertConnection({
            name: "Local",
            baseUrl: DEFAULT_BASE_URL,
            apiToken: "",
          })}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          const saved = connection.connections[0];
          if (saved) {
            void connection.connect(saved);
          }
        }}
      >
        Connect saved
      </button>
      <button
        type="button"
        onClick={() =>
          void connection.connect({
            baseUrl: "https://draft.example",
            apiToken: "",
          })}
      >
        Connect draft
      </button>
      <button type="button" onClick={() => connection.disconnect()}>
        Disconnect
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ConnectionProvider>
      <Probe />
    </ConnectionProvider>,
  );
}

describe("ConnectionProvider", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    getStatus.mockReset();
  });

  it("starts disconnected and does not connect on mount", async () => {
    renderProvider();
    expect(screen.getByTestId("connecting")).toHaveTextContent("false");
    expect(screen.getByTestId("status")).toHaveTextContent("none");
    expect(getStatus).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("saves a connection without calling /status", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(getStatus).not.toHaveBeenCalled();
    expect(localStorage.getItem(CONNECTIONS_STORAGE_KEY)).toContain("Local");
  });

  it("sets activeId when connecting a saved row", async () => {
    const user = userEvent.setup();
    getStatus.mockResolvedValue(statusResponse);
    renderProvider();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Connect saved" }));
    expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1");
    expect(screen.getByTestId("active")).not.toHaveTextContent("none");
  });

  it("connects a draft without selecting a saved row", async () => {
    const user = userEvent.setup();
    getStatus.mockResolvedValue(statusResponse);
    renderProvider();
    await user.click(screen.getByRole("button", { name: "Connect draft" }));
    expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("clears the session on disconnect and keeps the list", async () => {
    const user = userEvent.setup();
    getStatus.mockResolvedValue(statusResponse);
    renderProvider();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Connect saved" }));
    await screen.findByTestId("status");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByTestId("status")).toHaveTextContent("none");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
