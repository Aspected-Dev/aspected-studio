import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CopyableReadonlyField } from "./copyable-readonly-field.tsx"

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/utils.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils.ts")>()
  return { ...actual, copyToClipboard }
})

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from "sonner"

beforeEach(() => {
  copyToClipboard.mockClear()
  vi.mocked(toast.success).mockClear()
})

afterEach(() => {
  cleanup()
})

describe("CopyableReadonlyField", () => {
  it("copies the field value when the copy button is clicked", async () => {
    const user = userEvent.setup()
    render(
      <CopyableReadonlyField
        id="aspect-name"
        label="Name"
        value="category"
      />,
    )

    expect(screen.getByLabelText("Name")).toHaveValue("category")
    await user.click(screen.getByRole("button", { name: "Copy Name" }))
    expect(copyToClipboard).toHaveBeenCalledWith("category")
    expect(toast.success).toHaveBeenCalledWith("Copied name")
  })
})
