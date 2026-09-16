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

  it("shows a time input when withTime is set", () => {
    render(
      <DateTimePicker
        value={new Date(2024, 0, 2, 9, 30)}
        onChange={vi.fn()}
        withTime
        ariaLabel="released value"
      />,
    )
    expect(screen.getByLabelText("released value time")).toHaveValue("09:30")
  })
})
