import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DateTimePicker } from "./date-time-picker.tsx"

afterEach(() => {
  cleanup()
})

describe("DateTimePicker", () => {
  it("opens the calendar and selects a day", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DateTimePicker
        value={null}
        onChange={onChange}
        ariaLabel="released value"
      />,
    )

    await user.click(screen.getByRole("button", { name: "released value" }))
    const day = await screen.findByRole("gridcell", { name: "15" })
    const dayButton = day.querySelector("button") ?? day
    await user.click(dayButton)

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0] as Date
    expect(next.getDate()).toBe(15)
  })

  it("makes the trigger fill the row width", () => {
    render(
      <DateTimePicker
        value={null}
        onChange={vi.fn()}
        ariaLabel="released value"
      />,
    )
    expect(screen.getByRole("button", { name: "released value" })).toHaveClass(
      "flex-1",
    )
  })

  it("shows year-only on the trigger and bounds the calendar", async () => {
    const user = userEvent.setup()
    render(
      <DateTimePicker
        value={new Date(1989, 0, 1)}
        onChange={vi.fn()}
        ariaLabel="released value"
        yearOnly
        minYear={1910}
        maxYear={2020}
      />,
    )

    expect(screen.getByRole("button", { name: "released value" }))
      .toHaveTextContent("1989")

    await user.click(screen.getByRole("button", { name: "released value" }))
    const yearSelect = await screen.findByRole("combobox", {
      name: /year/i,
    })
    expect(yearSelect).toBeInTheDocument()
    expect(yearSelect).toHaveTextContent("1989")
  })

  it("shows a seconds-capable time input when withTime is on", () => {
    render(
      <DateTimePicker
        value={new Date(2020, 5, 15, 10, 30, 45)}
        onChange={vi.fn()}
        ariaLabel="event value"
        withTime
      />,
    )
    const time = screen.getByLabelText("event value time")
    expect(time).toHaveAttribute("type", "time")
    expect(time).toHaveAttribute("step", "1")
    expect(time).toHaveValue("10:30:45")
  })
})
