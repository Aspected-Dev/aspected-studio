import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConnectionFooter } from "./connection-footer.tsx"
import type { SavedConnection } from "@/lib/aspected/connection.ts"

const saved: SavedConnection = {
  id: "conn-1",
  name: "localhost:8080",
  baseUrl: "http://localhost:8080/",
  apiToken: "secret",
}

const { connection, openEdit } = vi.hoisted(() => {
  const disconnect = vi.fn()
  const openEdit = vi.fn()
  const savedConnection = {
    id: "conn-1",
    name: "localhost:8080",
    baseUrl: "http://localhost:8080/",
    apiToken: "secret",
  }
  return {
    openEdit,
    connection: {
      settings: { baseUrl: "http://localhost:8080", apiToken: "secret" },
      client: {},
      status: {
        version: "0.4.1",
        uptime: "0w 0d 0h 1m 2s",
        config: {
          corsEnabled: false,
          httpsEnabled: false,
          tokenAuthEnabled: true,
        },
      } as {
        version: string
        uptime: string
        config: {
          corsEnabled: boolean
          httpsEnabled: boolean
          tokenAuthEnabled: boolean
        }
      } | null,
      error: null as string | null,
      connecting: false,
      activeId: "conn-1" as string | null,
      statusReceivedAt: null as number | null,
      connections: [savedConnection],
      upsertConnection: vi.fn(),
      deleteConnection: vi.fn(),
      connect: vi.fn(),
      disconnect,
    },
  }
})

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}))

vi.mock("@/components/connection-dialog.tsx", () => ({
  useConnectionDialog: () => ({
    openNew: vi.fn(),
    openEdit,
  }),
}))

describe("ConnectionFooter", () => {
  beforeEach(() => {
    connection.statusReceivedAt = Date.now()
  })

  afterEach(() => {
    cleanup()
    connection.disconnect.mockReset()
    connection.deleteConnection.mockReset()
    openEdit.mockReset()
    connection.connections = [saved]
    connection.activeId = "conn-1"
    connection.status = {
      version: "0.4.1",
      uptime: "0w 0d 0h 1m 2s",
      config: {
        corsEnabled: false,
        httpsEnabled: false,
        tokenAuthEnabled: true,
      },
    }
    connection.connecting = false
  })

  it("shows version and uptime on the active connection", () => {
    render(<ConnectionFooter />)
    expect(screen.getByText("localhost:8080")).toBeInTheDocument()
    expect(screen.getByText("v0.4.1")).toBeInTheDocument()
    expect(screen.getByText("0w 0d 0h 1m 2s")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Disconnect" }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Connect" }))
      .not.toBeInTheDocument()
  })

  it("offers Disconnect and Remove as separate menu actions", async () => {
    const user = userEvent.setup()
    render(<ConnectionFooter />)
    await user.click(
      screen.getByRole("button", { name: "Connection actions" }),
    )
    expect(
      await screen.findByRole("menuitem", { name: "Disconnect" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Copy server URL" }))
      .toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Remove" }))
      .toBeInTheDocument()
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }))
    expect(connection.disconnect).toHaveBeenCalledTimes(1)
  })

  it("hides Disconnect when the row is not the live session", async () => {
    connection.status = null
    connection.activeId = null
    const user = userEvent.setup()
    render(<ConnectionFooter />)
    const connect = screen.getByRole("button", { name: "Connect" })
    expect(connect).toBeInTheDocument()
    expect(connect).not.toHaveClass("w-full")
    expect(connect).toHaveClass(
      "opacity-0",
      "group-hover/connection:opacity-100",
      "group-focus-within/connection:opacity-100",
    )
    await user.click(
      screen.getByRole("button", { name: "Connection actions" }),
    )
    expect(screen.queryByRole("menuitem", { name: "Disconnect" }))
      .not.toBeInTheDocument()
    expect(
      await screen.findByRole("menuitem", { name: "Remove" }),
    ).toBeInTheDocument()
  })
})
