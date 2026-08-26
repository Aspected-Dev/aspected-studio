import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RequestInspector } from "./request-inspector.tsx"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe("RequestInspector", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows the request body in a read-only JSON editor", () => {
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

    const editor = screen.getByTestId("json-editor")
    expect(editor).toHaveAttribute("readonly")
    expect(editor).toHaveValue(JSON.stringify({ idSize: 36 }, null, 2))

    const curl = document.querySelector("pre")
    expect(curl).toBeInTheDocument()
    expect(curl).toHaveTextContent(/curl/)
    expect(curl).toHaveTextContent("-X PUT")
  })
})
