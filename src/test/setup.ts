import { createElement } from "react"
import { vi } from "vitest"
import "@testing-library/jest-dom/vitest"

// Recharts and the Base UI popups measure their containers through
// ResizeObserver, which jsdom lacks. The stub reports each observed element
// once with its (always zero) jsdom box, because callers that feature-detect
// ResizeObserver wait for a first measurement before they render.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    #callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
    }

    observe(target: Element) {
      const entry = {
        target,
        contentRect: target.getBoundingClientRect(),
      } as ResizeObserverEntry
      this.#callback([entry], this)
    }

    unobserve() {}
    disconnect() {}
  }
}

vi.mock("@/components/json-editor.tsx", () => ({
  JsonEditor: (props: {
    value: string
    onChange?: (value: string) => void
    readOnly?: boolean
  }) =>
    createElement("textarea", {
      "data-testid": "json-editor",
      "aria-readonly": props.readOnly ? "true" : "false",
      value: props.value,
      readOnly: props.readOnly,
      onChange: (event: { currentTarget: { value: string } }) =>
        props.onChange?.(event.currentTarget.value),
    }),
}))
