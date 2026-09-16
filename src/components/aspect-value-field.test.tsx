import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AspectValueField } from "./aspect-value-field.tsx"
import type { StoredAspect } from "@/lib/aspected/types.ts"

afterEach(() => {
  cleanup()
})

function aspect(
  type: StoredAspect["type"],
  settings: StoredAspect["settings"] = {},
  name = type,
): StoredAspect {
  return { name, type, path: `$.${name}`, settings }
}

describe("AspectValueField", () => {
  it("renders a select for enum aspects", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectValueField
        aspect={aspect("enum", { values: ["laptop", "phone"] }, "category")}
        value=""
        onChange={onChange}
      />,
    )

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "category value" }))
    await user.click(await screen.findByRole("option", { name: "laptop" }))
    expect(onChange).toHaveBeenCalledWith("laptop")
  })

  it("renders a textarea for text aspects", () => {
    render(
      <AspectValueField
        aspect={aspect("text", { model: "nomic" }, "title")}
        value=""
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("title value").tagName).toBe("TEXTAREA")
  })

  it("renders a number input for number aspects", () => {
    render(
      <AspectValueField
        aspect={aspect("number", { min: 0, max: 100 }, "price")}
        value="10"
        onChange={vi.fn()}
      />,
    )
    const input = screen.getByLabelText("price value")
    expect(input).toHaveAttribute("type", "number")
    expect(input).not.toHaveAttribute("min")
    expect(input).not.toHaveAttribute("max")
  })

  it("marks the control invalid when invalid is set", () => {
    render(
      <AspectValueField
        aspect={aspect("number", { max: 10 }, "price")}
        value="20"
        onChange={vi.fn()}
        invalid
      />,
    )
    expect(screen.getByLabelText("price value")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })

  it("shows an inline error message", () => {
    render(
      <AspectValueField
        aspect={aspect("number", { max: 10 }, "price")}
        value="20"
        onChange={vi.fn()}
        error="Must be between 0 and 10"
      />,
    )
    expect(screen.getByText("Must be between 0 and 10")).toBeInTheDocument()
    expect(screen.getByLabelText("price value")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })
})
