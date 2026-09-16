import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JsonInspectSheet } from "./json-inspect-sheet.tsx"
import { prettyJson } from "@/lib/pretty-json.ts"

afterEach(() => {
  cleanup()
})

describe("JsonInspectSheet", () => {
  it("shows the title, summary, and pretty JSON when open", () => {
    const value = { id: "prod-001", distance: 0.12 }
    render(
      <JsonInspectSheet
        open
        onOpenChange={vi.fn()}
        title="prod-001"
        description="Search result"
        value={value}
      >
        <p>Distance 0.12</p>
      </JsonInspectSheet>,
    )

    expect(screen.getByRole("heading", { name: "prod-001" }))
      .toBeInTheDocument()
    expect(screen.getByText("Search result")).toBeInTheDocument()
    expect(screen.getByText("Distance 0.12")).toBeInTheDocument()
    const editor = screen.getByTestId("json-editor")
    expect(editor).toHaveAttribute("readonly")
    expect(editor).toHaveValue(prettyJson(value))
  })

  it("shows an empty state when value is nullish", () => {
    render(
      <JsonInspectSheet
        open
        onOpenChange={vi.fn()}
        title="empty"
        value={null}
      />,
    )
    expect(screen.getByText("No JSON to show.")).toBeInTheDocument()
    expect(screen.queryByTestId("json-editor")).not.toBeInTheDocument()
  })

  it("shows an optional JSON label above the editor", () => {
    render(
      <JsonInspectSheet
        open
        onOpenChange={vi.fn()}
        title="aspect"
        value={{ model: "nomic" }}
        jsonLabel="Settings"
      />,
    )
    expect(screen.getByText("Settings")).toBeInTheDocument()
    expect(screen.getByTestId("json-editor")).toHaveValue(
      prettyJson({ model: "nomic" }),
    )
  })

  it("skips the default JSON section when value is omitted", () => {
    render(
      <JsonInspectSheet
        open
        onOpenChange={vi.fn()}
        title="result"
      >
        <p>Children only</p>
      </JsonInspectSheet>,
    )
    expect(screen.getByText("Children only")).toBeInTheDocument()
    expect(screen.queryByText("No JSON to show.")).not.toBeInTheDocument()
    expect(screen.queryByTestId("json-editor")).not.toBeInTheDocument()
  })
})
