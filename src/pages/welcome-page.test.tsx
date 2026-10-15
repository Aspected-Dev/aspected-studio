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

  it("shows same-origin copy when served from the Aspected process", () => {
    studioConfig.bundled = true
    render(<WelcomePage />)
    expect(screen.getByText(/same origin/)).toBeInTheDocument()
  })
})
