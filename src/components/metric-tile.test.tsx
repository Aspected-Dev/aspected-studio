import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MetricTile } from "./metric-tile.tsx"

afterEach(cleanup)

describe("MetricTile", () => {
  it("renders the label, value, detail, and a help button", () => {
    render(
      <MetricTile
        label="nDCG@10"
        value={0.8125}
        digits={3}
        detail="4 cases"
        help="Order quality against the best ordering possible."
      />,
    )

    expect(screen.getByText("nDCG@10")).toBeInTheDocument()
    expect(screen.getByText("0.813")).toBeInTheDocument()
    expect(screen.getByText("4 cases")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About nDCG@10" }))
      .toBeInTheDocument()
  })

  it("signs a delta against the baseline", () => {
    render(
      <MetricTile
        label="Recall@10"
        value={0.5}
        digits={3}
        detail="4 cases"
        help="Share of expected documents found."
        delta={0.125}
      />,
    )

    expect(screen.getByText("+0.125")).toBeInTheDocument()
  })

  it("shows a negative delta with a minus sign", () => {
    render(
      <MetricTile
        label="Recall@10"
        value={0.5}
        digits={3}
        detail="4 cases"
        help="Share of expected documents found."
        delta={-0.25}
      />,
    )

    expect(screen.getByText("-0.250")).toBeInTheDocument()
  })

  it("hides a delta that rounds away at the shown precision", () => {
    render(
      <MetricTile
        label="Recall@10"
        value={0.5}
        digits={3}
        detail="4 cases"
        help="Share of expected documents found."
        delta={0.0001}
      />,
    )

    expect(screen.queryByText(/^[+-]0\./)).not.toBeInTheDocument()
  })
})
