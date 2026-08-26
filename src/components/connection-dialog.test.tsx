import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ConnectionDialog } from "./connection-dialog.tsx"
import { DEFAULT_BASE_URL } from "@/lib/aspected/connection.ts"

const { connection } = vi.hoisted(() => {
  const upsertConnection = vi.fn((input: {
    id?: string
    name: string
    baseUrl: string
    apiToken: string
  }) => ({
    id: input.id ?? "saved-1",
    name: input.name.trim() || "localhost:8080",
    baseUrl: input.baseUrl,
    apiToken: input.apiToken,
  }))
  const connect = vi.fn()
  return {
    connection: {
      settings: { baseUrl: "http://localhost:8080", apiToken: "" },
      client: {},
      status: null,
      error: null,
      connecting: false,
      activeId: null,
      statusReceivedAt: null,
      connections: [],
      upsertConnection,
      deleteConnection: vi.fn(),
      connect,
      disconnect: vi.fn(),
    },
  }
})

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderDialog() {
  return render(
    <ConnectionDialog open onOpenChange={vi.fn()} />,
  )
}

describe("ConnectionDialog", () => {
  afterEach(() => {
    cleanup()
    connection.upsertConnection.mockClear()
    connection.connect.mockReset()
    connection.connecting = false
  })

  it("saves without calling /status", async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(connection.upsertConnection).toHaveBeenCalledTimes(1)
    expect(connection.connect).not.toHaveBeenCalled()
  })

  it("connects the draft without saving", async () => {
    const user = userEvent.setup()
    connection.connect.mockResolvedValue({
      version: "0.4.1",
      uptime: "1s",
      config: {
        corsEnabled: false,
        httpsEnabled: false,
        tokenAuthEnabled: false,
      },
    })
    renderDialog()
    await user.click(screen.getByRole("button", { name: "Connect" }))
    expect(connection.upsertConnection).not.toHaveBeenCalled()
    expect(connection.connect).toHaveBeenCalledWith({
      baseUrl: DEFAULT_BASE_URL,
      apiToken: "",
    })
  })

  it("saves then connects from Save and Connect", async () => {
    const user = userEvent.setup()
    connection.connect.mockResolvedValue({
      version: "0.4.1",
      uptime: "1s",
      config: {
        corsEnabled: false,
        httpsEnabled: false,
        tokenAuthEnabled: false,
      },
    })
    renderDialog()
    await user.click(screen.getByRole("button", { name: "Save and Connect" }))
    expect(connection.upsertConnection).toHaveBeenCalledTimes(1)
    expect(connection.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "saved-1",
        baseUrl: DEFAULT_BASE_URL,
      }),
    )
  })

  it("shows an inline error when Server URL is cleared and Save is clicked", async () => {
    const user = userEvent.setup()
    renderDialog()
    const urlInput = screen.getByRole("textbox", { name: /server url/i })
    await user.clear(urlInput)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(
      await screen.findByText("Server URL is required"),
    ).toBeInTheDocument()
    expect(connection.upsertConnection).not.toHaveBeenCalled()
  })

  it("shows an inline error when Server URL is not a valid URL", async () => {
    const user = userEvent.setup()
    renderDialog()
    const urlInput = screen.getByRole("textbox", { name: /server url/i })
    await user.clear(urlInput)
    await user.type(urlInput, "not-a-url")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(
      await screen.findByText(/must be a valid url/i),
    ).toBeInTheDocument()
    expect(connection.upsertConnection).not.toHaveBeenCalled()
  })
})
