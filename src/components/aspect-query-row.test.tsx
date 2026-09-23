import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AspectQueryRow,
  aspectQueryStatus,
  aspectUsesOverlayControl,
} from "./aspect-query-row.tsx"
import type { StoredAspect } from "@/lib/aspected/types.ts"

afterEach(() => {
  cleanup()
})

const title: StoredAspect = {
  name: "title",
  type: "text",
  path: "$.title",
  settings: {},
}

const category: StoredAspect = {
  name: "category",
  type: "enum",
  path: "$.category",
  settings: { values: ["laptop", "phone"] },
}

const released: StoredAspect = {
  name: "released",
  type: "datetime",
  path: "$.released",
  settings: { granularity: ["year", "month", "day"] },
}

describe("aspectQueryStatus", () => {
  it("treats blank values as sparse", () => {
    expect(aspectQueryStatus("", 1)).toBe("sparse")
    expect(aspectQueryStatus("  ", 2)).toBe("sparse")
  })

  it("marks filled values with weight 0 as not scored", () => {
    expect(aspectQueryStatus("rake", 0)).toBe("not-scored")
  })

  it("marks filled values with a positive weight as in query", () => {
    expect(aspectQueryStatus("rake", 1)).toBe("in-query")
  })
})

describe("aspectUsesOverlayControl", () => {
  it("detects enum and calendar datetime controls", () => {
    expect(aspectUsesOverlayControl(category)).toBe(true)
    expect(aspectUsesOverlayControl(released)).toBe(true)
    expect(aspectUsesOverlayControl(title)).toBe(false)
  })
})

describe("AspectQueryRow", () => {
  it("clears the value when the include switch is turned off", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={title}
        value="rake"
        weight={1}
        onChange={onChange}
      />,
    )

    expect(screen.getByLabelText("Include title")).toBeChecked()
    await user.click(screen.getByLabelText("Include title"))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("restores weight 1 when turning on a parked aspect", async () => {
    const onChange = vi.fn()
    const onWeightChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={title}
        value="rake"
        weight={0}
        onChange={onChange}
        onWeightChange={onWeightChange}
      />,
    )

    expect(screen.getByLabelText("Include title")).not.toBeChecked()
    await user.click(screen.getByLabelText("Include title"))
    expect(onWeightChange).toHaveBeenCalledWith(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("stays off when include is toggled on then off again", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={category}
        value=""
        weight={1}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByLabelText("Include category"))
    expect(screen.getByLabelText("Include category")).toBeChecked()
    expect(await screen.findByRole("option", { name: "laptop" }))
      .toBeInTheDocument()

    await user.click(screen.getByLabelText("Include category"))
    expect(screen.getByLabelText("Include category")).not.toBeChecked()
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("keeps include on while the enum select is open, then reverts if empty", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={category}
        value=""
        weight={1}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByLabelText("Include category"))
    expect(screen.getByLabelText("Include category")).toBeChecked()
    expect(await screen.findByRole("option", { name: "laptop" }))
      .toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.getByLabelText("Include category")).not.toBeChecked()
  })

  it("keeps include on after an enum value is chosen", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <AspectQueryRow
        aspect={category}
        value=""
        weight={1}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByLabelText("Include category"))
    await user.click(await screen.findByRole("option", { name: "laptop" }))
    expect(onChange).toHaveBeenCalledWith("laptop")

    rerender(
      <AspectQueryRow
        aspect={category}
        value="laptop"
        weight={1}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText("Include category")).toBeChecked()
  })

  it("opens the date picker and keeps include on while choosing", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={released}
        value=""
        weight={1}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByLabelText("Include released"))
    expect(screen.getByLabelText("Include released")).toBeChecked()
    expect(await screen.findByRole("grid")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.getByLabelText("Include released")).not.toBeChecked()
  })

  it("reverts include after blurring a blank text field", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AspectQueryRow
        aspect={title}
        value=""
        weight={1}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByLabelText("Include title"))
    expect(screen.getByLabelText("Include title")).toBeChecked()
    const field = screen.getByLabelText("title value")
    await waitFor(() => {
      expect(field).toHaveFocus()
    })

    await user.tab()
    expect(screen.getByLabelText("Include title")).not.toBeChecked()
  })
})
