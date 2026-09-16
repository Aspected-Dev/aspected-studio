import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JsonPreviewCell } from "./json-preview-cell.tsx"

afterEach(() => {
  cleanup()
})

describe("JsonPreviewCell", () => {
  it("renders compact truncated JSON with a title peek", () => {
    render(<JsonPreviewCell value={{ model: "nomic" }} />)
    const cell = screen.getByText('{"model":"nomic"}')
    expect(cell).toHaveAttribute("title", '{"model":"nomic"}')
    expect(cell).toHaveClass("truncate", "w-36")
  })

  it("uses the wide width preset", () => {
    render(<JsonPreviewCell value={{ a: 1 }} width="wide" />)
    expect(screen.getByText('{"a":1}')).toHaveClass("w-40")
  })

  it("renders nothing for nullish values", () => {
    const { container } = render(<JsonPreviewCell value={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("forwards click handlers", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<JsonPreviewCell value={1} onClick={onClick} />)
    await user.click(screen.getByText("1"))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
