import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { NotFoundPage } from "./not-found-page.tsx"

describe("NotFoundPage", () => {
  afterEach(() => {
    cleanup()
  })

  it("links back to the indexes home", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Back to indexes" }))
      .toHaveAttribute("href", "/")
  })
})
