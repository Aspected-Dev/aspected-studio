import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RequestInspector } from "./request-inspector.tsx"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe("RequestInspector", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("shows an empty state when nothing has been recorded", () => {
    render(<RequestInspector request={null} />)

    expect(screen.getByText("Request")).toBeInTheDocument()
    expect(screen.getByText("Run a request to inspect it.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Code" })).not
      .toBeInTheDocument()
  })

  it("shows method, path, and the JSON body without an on-page curl pre", () => {
    render(
      <RequestInspector
        request={{
          method: "PUT",
          path: "/indexes/products",
          url: "http://localhost:8080/indexes/products",
          headers: { "content-type": "application/json" },
          body: { idSize: 36 },
        }}
      />,
    )

    expect(screen.getByText("PUT")).toBeInTheDocument()
    expect(screen.getByText("/indexes/products")).toBeInTheDocument()

    const editor = screen.getByTestId("json-editor")
    expect(editor).toHaveAttribute("readonly")
    expect(editor).toHaveAttribute("data-language", "json")
    expect(editor).toHaveValue(JSON.stringify({ idSize: 36 }, null, 2))
    expect(document.querySelector("pre")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument()
  })

  it("shows No body when the request has none", () => {
    render(
      <RequestInspector
        request={{
          method: "DELETE",
          path: "/indexes/products",
          url: "http://localhost:8080/indexes/products",
          headers: {},
        }}
      />,
    )

    expect(screen.getByText("No body.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy" })).not
      .toBeInTheDocument()
  })

  it("opens the Code sheet with curl and copies from the editor", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const { toast } = await import("sonner")

    render(
      <RequestInspector
        request={{
          method: "PUT",
          path: "/indexes/products",
          url: "http://localhost:8080/indexes/products",
          headers: { "content-type": "application/json" },
          body: { idSize: 36 },
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Code" }))

    expect(
      await screen.findByText(/curl for this request/i),
    ).toBeInTheDocument()
    const editors = screen.getAllByTestId("json-editor")
    const shell = editors.find((node) =>
      node.getAttribute("data-language") === "shell"
    )
    expect(shell).toBeTruthy()
    expect((shell as HTMLTextAreaElement).value).toMatch(/curl/)
    expect((shell as HTMLTextAreaElement).value).toMatch(/-X PUT/)

    const shellHost = shell!.closest("[data-slot=json-editor-mock]")
    expect(shellHost).toBeTruthy()
    await user.click(
      within(shellHost as HTMLElement).getByRole("button", {
        name: "Copy",
      }),
    )
    expect(writeText).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith("Copied")
  })

  it("copies the JSON body from the read-only editor", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const { toast } = await import("sonner")

    render(
      <RequestInspector
        request={{
          method: "POST",
          path: "/indexes/products/search",
          url: "http://localhost:8080/indexes/products/search",
          headers: {},
          body: { k: 20 },
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Copy" }))
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ k: 20 }, null, 2))
    expect(toast.success).toHaveBeenCalledWith("Copied")
  })
})
