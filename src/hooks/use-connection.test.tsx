import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ConnectionProvider, useConnection } from "@/hooks/use-connection.tsx"
import { AspectedApiError } from "@/lib/aspected/client.ts"
import type { ConnectionSettings } from "@/lib/aspected/connection.ts"
import {
  CONNECTIONS_STORAGE_KEY,
  DEFAULT_BASE_URL,
} from "@/lib/aspected/connection.ts"
import type { StatusResponse } from "@/lib/aspected/types.ts"

const statusResponse: StatusResponse = {
  version: "0.4.1",
  uptime: "0w 0d 0h 1m 2s",
  config: {
    corsEnabled: false,
    httpsEnabled: false,
    tokenAuthEnabled: true,
  },
}

/**
 * Per-instance callbacks captured from the AspectedClient mock constructor,
 * keyed by the instance index (order of construction). Tests can fire these
 * to simulate a mid-session network drop.
 */
const capturedOnNetworkError: Array<(() => void) | undefined> = []

const { getStatus } = vi.hoisted(() => ({
  getStatus: vi.fn(),
}))

vi.mock("@/lib/aspected/client.ts", () => ({
  AspectedApiError: class AspectedApiError extends Error {
    status: number
    body: unknown
    constructor(message: string, status: number, body?: unknown) {
      super(message)
      this.name = "AspectedApiError"
      this.status = status
      this.body = body
    }
  },
  AspectedClient: class {
    constructor(
      public connection: ConnectionSettings,
      options?: { onNetworkError?: () => void },
    ) {
      capturedOnNetworkError.push(options?.onNetworkError)
    }
    getStatus = getStatus
  },
}))

function Probe() {
  const connection = useConnection()
  return (
    <div>
      <span data-testid="connecting">{String(connection.connecting)}</span>
      <span data-testid="status">{connection.status?.version ?? "none"}</span>
      <span data-testid="active">{connection.activeId ?? "none"}</span>
      <span data-testid="count">{connection.connections.length}</span>
      <span data-testid="wasConnected">{String(connection.wasConnected)}</span>
      <span data-testid="retrying">{String(connection.retrying)}</span>
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
          const saved = connection.connections[0]
          if (saved) {
            void connection.connect(saved)
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
  )
}

function renderProvider() {
  return render(
    <ConnectionProvider>
      <Probe />
    </ConnectionProvider>,
  )
}

describe("ConnectionProvider", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    getStatus.mockReset()
    capturedOnNetworkError.length = 0
  })

  it("starts disconnected and does not connect on mount", async () => {
    renderProvider()
    expect(screen.getByTestId("connecting")).toHaveTextContent("false")
    expect(screen.getByTestId("status")).toHaveTextContent("none")
    expect(getStatus).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(getStatus).not.toHaveBeenCalled()
  })

  it("saves a connection without calling /status", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(getStatus).not.toHaveBeenCalled()
    expect(localStorage.getItem(CONNECTIONS_STORAGE_KEY)).toContain("Local")
  })

  it("sets activeId when connecting a saved row", async () => {
    const user = userEvent.setup()
    getStatus.mockResolvedValue(statusResponse)
    renderProvider()
    await user.click(screen.getByRole("button", { name: "Save" }))
    await user.click(screen.getByRole("button", { name: "Connect saved" }))
    expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")
    expect(screen.getByTestId("active")).not.toHaveTextContent("none")
  })

  it("connects a draft without selecting a saved row", async () => {
    const user = userEvent.setup()
    getStatus.mockResolvedValue(statusResponse)
    renderProvider()
    await user.click(screen.getByRole("button", { name: "Connect draft" }))
    expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")
    expect(screen.getByTestId("active")).toHaveTextContent("none")
  })

  it("clears the session on disconnect and keeps the list", async () => {
    const user = userEvent.setup()
    getStatus.mockResolvedValue(statusResponse)
    renderProvider()
    await user.click(screen.getByRole("button", { name: "Save" }))
    await user.click(screen.getByRole("button", { name: "Connect saved" }))
    await screen.findByTestId("status")
    await user.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(screen.getByTestId("status")).toHaveTextContent("none")
    expect(screen.getByTestId("active")).toHaveTextContent("none")
    expect(screen.getByTestId("count")).toHaveTextContent("1")
  })

  describe("handleDrop via onNetworkError", () => {
    it("clears status and sets wasConnected when the live client fires onNetworkError", async () => {
      const user = userEvent.setup()
      getStatus.mockResolvedValue(statusResponse)
      renderProvider()
      await user.click(screen.getByRole("button", { name: "Connect draft" }))
      expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")

      // The live client created after a successful connect is the one that
      // has onNetworkError wired (it's the useMemo client, index 1; index 0
      // is the bare client used inside connect() for the initial handshake).
      const onNetworkError = capturedOnNetworkError.find(Boolean)
      expect(onNetworkError).toBeDefined()

      act(() => {
        onNetworkError!()
      })

      expect(screen.getByTestId("status")).toHaveTextContent("none")
      expect(screen.getByTestId("wasConnected")).toHaveTextContent("true")
    })

    it("does not trigger a drop when not connected (status already null)", () => {
      renderProvider()
      // The client created on mount (not connected) has onNetworkError.
      const onNetworkError = capturedOnNetworkError.find(Boolean)
      if (!onNetworkError) return // guard: no callback means nothing to test

      act(() => {
        onNetworkError()
      })

      // Should still be disconnected, wasConnected should remain false.
      expect(screen.getByTestId("status")).toHaveTextContent("none")
      expect(screen.getByTestId("wasConnected")).toHaveTextContent("false")
    })
  })

  describe("heartbeat", () => {
    it("refreshes status on heartbeat tick", async () => {
      // Spy on setInterval to capture the heartbeat callback directly,
      // avoiding timer manipulation that conflicts with userEvent and waitFor.
      // Only capture the 30 s interval (heartbeat), not 1 s ones (other hooks).
      let heartbeatCallback: (() => void) | null = null
      const setIntervalSpy = vi
        .spyOn(globalThis, "setInterval")
        .mockImplementation((cb, delay) => {
          if (delay === 30_000) heartbeatCallback = cb as () => void
          return 0 as unknown as ReturnType<typeof setInterval>
        })

      const user = userEvent.setup()
      getStatus.mockResolvedValue(statusResponse)
      renderProvider()
      await user.click(screen.getByRole("button", { name: "Connect draft" }))
      expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")

      const updatedStatus = { ...statusResponse, version: "0.5.0" }
      getStatus.mockResolvedValue(updatedStatus)

      expect(heartbeatCallback).not.toBeNull()
      await act(async () => {
        heartbeatCallback!()
        await Promise.resolve()
      })

      expect(screen.getByTestId("status")).toHaveTextContent("0.5.0")
      setIntervalSpy.mockRestore()
    })

    it("calls handleDrop when heartbeat gets a network error", async () => {
      let heartbeatCallback: (() => void) | null = null
      const setIntervalSpy = vi
        .spyOn(globalThis, "setInterval")
        .mockImplementation((cb, delay) => {
          if (delay === 30_000) heartbeatCallback = cb as () => void
          return 0 as unknown as ReturnType<typeof setInterval>
        })

      const user = userEvent.setup()
      getStatus.mockResolvedValue(statusResponse)
      renderProvider()
      await user.click(screen.getByRole("button", { name: "Connect draft" }))
      expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")

      getStatus.mockRejectedValue(
        new AspectedApiError("Failed to fetch", 0),
      )

      expect(heartbeatCallback).not.toBeNull()
      await act(async () => {
        heartbeatCallback!()
        await Promise.resolve()
      })

      expect(screen.getByTestId("status")).toHaveTextContent("none")
      expect(screen.getByTestId("wasConnected")).toHaveTextContent("true")
      setIntervalSpy.mockRestore()
    })

    it("does not drop on heartbeat HTTP errors (4xx/5xx)", async () => {
      let heartbeatCallback: (() => void) | null = null
      const setIntervalSpy = vi
        .spyOn(globalThis, "setInterval")
        .mockImplementation((cb, delay) => {
          if (delay === 30_000) heartbeatCallback = cb as () => void
          return 0 as unknown as ReturnType<typeof setInterval>
        })

      const user = userEvent.setup()
      getStatus.mockResolvedValue(statusResponse)
      renderProvider()
      await user.click(screen.getByRole("button", { name: "Connect draft" }))
      expect(await screen.findByTestId("status")).toHaveTextContent("0.4.1")

      getStatus.mockRejectedValue(
        new AspectedApiError("Unauthorized", 401),
      )

      expect(heartbeatCallback).not.toBeNull()
      await act(async () => {
        heartbeatCallback!()
        await Promise.resolve()
      })

      // A 401 on the heartbeat does NOT drop the session.
      expect(screen.getByTestId("status")).toHaveTextContent("0.4.1")
      setIntervalSpy.mockRestore()
    })
  })
})
