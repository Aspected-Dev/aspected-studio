import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WelcomePage } from "./welcome-page.tsx"
import { docsUrl } from "@/lib/docs.ts"

const openNew = vi.fn()

vi.mock("@/components/connection-dialog.tsx", () => ({
  useConnectionDialog: () => ({
    openNew,
    openEdit: vi.fn(),
  }),
}))

const studioConfig = vi.hoisted(() => ({
  config: null as { bundled: boolean; apiPort?: number } | null,
  defaultBaseUrl: "http://localhost:8080",
  bundled: false,
}))

vi.mock("@/hooks/use-studio-config.tsx", () => ({
  useStudioConfig: () => studioConfig,
}))

describe("WelcomePage", () => {
  afterEach(() => {
    cleanup()
    openNew.mockReset()
    studioConfig.bundled = false
    studioConfig.config = null
    studioConfig.defaultBaseUrl = "http://localhost:8080"
  })

  it("prompts the user to add a connection", async () => {
    const user = userEvent.setup()
    render(<WelcomePage />)
    expect(
      screen.getByRole("heading", { name: "Welcome to Aspected Studio" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The default Docker port is 8080/),
    ).toBeInTheDocument()
    const addButton = screen.getByRole("button", {
      name: "Add new connection",
    })
    expect(addButton.querySelector("svg")).toBeInTheDocument()
    await user.click(addButton)
    expect(openNew).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("link", { name: /Getting started/ }))
      .toHaveAttribute("href", docsUrl("gettingStarted"))
    expect(screen.getByRole("link", { name: /tutorial/ }))
      .toHaveAttribute("href", docsUrl("tutorial"))
  })

  it("shows Studio and API ports when served from the container", () => {
    studioConfig.bundled = true
    studioConfig.config = { bundled: true, apiPort: 8080 }
    vi.stubGlobal("location", {
      ...window.location,
      port: "8081",
      protocol: "http:",
      origin: "http://localhost:8081",
    })
    render(<WelcomePage />)
    expect(
      screen.getByText(/Aspected container on port 8081/),
    ).toBeInTheDocument()
    expect(screen.getByText(/API listens on port 8080/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
