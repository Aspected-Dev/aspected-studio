import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlaygroundCompare } from "./playground-compare.tsx"
import type { PinnedRun } from "@/lib/aspected/compare.ts"
import type { PlaygroundFormValues } from "@/lib/aspected/playground.ts"

function form(
  overrides: Partial<PlaygroundFormValues> = {},
): PlaygroundFormValues {
  return {
    k: "20",
    autoRun: false,
    aspects: [
      {
        name: "title",
        type: "text",
        enabled: true,
        value: "rake",
        weight: 1,
      },
      {
        name: "price",
        type: "number",
        enabled: true,
        value: "20",
        weight: 1,
      },
    ],
    ...overrides,
  }
}

const pinned: PinnedRun = {
  values: form(),
  weightsUsed: { title: 1, price: 1 },
  request: {
    k: 20,
    query: { title: "rake", price: 20 },
    withDocs: true,
    withExplanation: true,
  },
  rows: [
    {
      id: "title-match",
      distance: 1,
      explanation: [
        { name: "title", distance: 0.1 },
        { name: "price", distance: 0.9 },
      ],
    },
    {
      id: "price-match",
      distance: 1.5,
      explanation: [
        { name: "title", distance: 0.9 },
        { name: "price", distance: 0.6 },
      ],
    },
    {
      id: "dropped-doc",
      distance: 2,
      explanation: [
        { name: "title", distance: 1 },
        { name: "price", distance: 1 },
      ],
    },
  ],
  ranking: [
    { id: "title-match", distance: 1 },
    { id: "price-match", distance: 1.5 },
    { id: "dropped-doc", distance: 2 },
  ],
}

/** B ranking: price-match rises, a new doc enters, dropped-doc leaves. */
const current = [
  { id: "price-match", distance: 0.4 },
  { id: "title-match", distance: 0.8 },
  { id: "new-doc", distance: 1.2 },
]

const currentValues = form({
  aspects: [
    {
      name: "title",
      type: "text",
      enabled: true,
      value: "rake",
      weight: 1,
    },
    {
      name: "price",
      type: "number",
      enabled: true,
      value: "20",
      weight: 4,
    },
  ],
})

describe("PlaygroundCompare", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows the pin CTA when nothing is pinned yet", async () => {
    const onPin = vi.fn()
    const user = userEvent.setup()

    render(
      <PlaygroundCompare
        pinned={null}
        current={[]}
        currentValues={form()}
        metric="Euclidean"
        canPin
        selectedId={null}
        onSelect={vi.fn()}
        onPin={onPin}
        onRestore={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Pin current as A" }))
    expect(onPin).toHaveBeenCalledTimes(1)
  })

  it("disables the pin CTA until a search can be pinned", () => {
    render(
      <PlaygroundCompare
        pinned={null}
        current={[]}
        currentValues={form()}
        metric="Euclidean"
        canPin={false}
        selectedId={null}
        onSelect={vi.fn()}
        onPin={vi.fn()}
        onRestore={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Pin current as A" }))
      .toBeDisabled()
    expect(
      screen.getByText("Run a search first so there is something to pin."),
    ).toBeInTheDocument()
  })

  it("shows no movement when B matches the ranking frozen at pin time", () => {
    render(
      <PlaygroundCompare
        pinned={pinned}
        current={pinned.ranking}
        currentValues={pinned.values}
        metric="Euclidean"
        canPin
        selectedId={null}
        onSelect={vi.fn()}
        onPin={vi.fn()}
        onRestore={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText(/0 entered, 0 left/)).toBeInTheDocument()
    expect(screen.getByText("Max shift")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("renders overlap, RBO, movement rows, and New/Dropped badges", () => {
    render(
      <PlaygroundCompare
        pinned={pinned}
        current={current}
        currentValues={currentValues}
        metric="Euclidean"
        canPin
        selectedId={null}
        onSelect={vi.fn()}
        onPin={vi.fn()}
        onRestore={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText("A vs B")).toBeInTheDocument()
    expect(screen.getByText("price weight 1 to 4")).toBeInTheDocument()
    expect(screen.getByText(/Overlap@3/)).toBeInTheDocument()
    expect(screen.getByText(/RBO \(p 0\.9\)/)).toBeInTheDocument()
    expect(screen.getByText("Top-weighted agreement")).toBeInTheDocument()
    expect(screen.getByText(/1 entered, 1 left/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /About Overlap@3/ }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: /About RBO/ }))
      .toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About Movement" }))
      .toBeInTheDocument()

    const table = screen.getByRole("table", { name: "Movement" })
    const bodyRows = within(table).getAllByRole("row").slice(1)
    expect(bodyRows).toHaveLength(4)
    expect(within(table).getByText("New")).toBeInTheDocument()
    expect(within(table).getByText("Dropped")).toBeInTheDocument()
    expect(within(table).getByText("new-doc")).toBeInTheDocument()
    expect(within(table).getByText("dropped-doc")).toBeInTheDocument()
  })
})
