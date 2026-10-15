import { createElement } from "react"
import { vi } from "vitest"
import "@testing-library/jest-dom/vitest"

/**
 * Per-file `localStorage`.
 *
 * The runtime hands every worker the same storage, so one file calling
 * `clear()` could wipe what another file had just written. Each file gets its
 * own in-memory copy instead, which keeps storage-backed suites independent.
 */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>()

  get length() {
    return this.#entries.size
  }

  key(index: number) {
    return [...this.#entries.keys()][index] ?? null
  }

  getItem(key: string) {
    return this.#entries.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.#entries.set(key, String(value))
  }

  removeItem(key: string) {
    this.#entries.delete(key)
  }

  clear() {
    this.#entries.clear()
  }
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  const storage = new MemoryStorage()
  for (const target of [globalThis, globalThis.window]) {
    if (target) {
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => storage,
      })
    }
  }
}

/**
 * Base UI menus and floating UI call these in jsdom, which does not implement
 * them. Without the stubs, a trigger click can no-op or throw mid-open.
 */
for (
  const method of [
    "hasPointerCapture",
    "setPointerCapture",
    "releasePointerCapture",
  ] as const
) {
  if (!(method in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, method, {
      configurable: true,
      writable: true,
      value: method === "hasPointerCapture" ? () => false : () => {},
    })
  }
}

if (!("scrollIntoView" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: () => {},
  })
}

/**
 * Recharts and Base UI popups measure through ResizeObserver, which jsdom
 * lacks. Report a non-zero box asynchronously so:
 * - feature-detecting callers get a first measurement and render
 * - we do not re-entrantly close a popup that is mid-open (a sync zero-size
 *   callback was making DocsHelpMenu flaky under suite load)
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    #callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
    }

    observe(target: Element) {
      const rect = target.getBoundingClientRect()
      const width = Math.max(rect.width, 1)
      const height = Math.max(rect.height, 1)
      const entry = {
        target,
        contentRect: {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: height,
          right: width,
          width,
          height,
          toJSON() {
            return this
          },
        },
        borderBoxSize: [{ inlineSize: width, blockSize: height }],
        contentBoxSize: [{ inlineSize: width, blockSize: height }],
        devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
      } as ResizeObserverEntry

      queueMicrotask(() => {
        this.#callback([entry], this)
      })
    }

    unobserve() {}
    disconnect() {}
  }
}

vi.mock("@/components/json-editor.tsx", () => {
  // Resolve the sonner mock once so copy clicks toast synchronously in tests.
  let toastSuccess: ((message: string) => void) | null = null
  void import("sonner").then((mod) => {
    toastSuccess = mod.toast.success
  })

  return {
    JsonEditor: (props: {
      value: string
      onChange?: (value: string) => void
      readOnly?: boolean
      language?: string
    }) =>
      createElement(
        "div",
        { "data-slot": "json-editor-mock" },
        createElement("textarea", {
          "data-testid": "json-editor",
          "data-language": props.language ?? "json",
          "aria-readonly": props.readOnly ? "true" : "false",
          value: props.value,
          readOnly: props.readOnly,
          onChange: (event: { currentTarget: { value: string } }) =>
            props.onChange?.(event.currentTarget.value),
        }),
        props.readOnly
          ? createElement(
            "button",
            {
              type: "button",
              "aria-label": "Copy",
              onClick: () => {
                void navigator.clipboard.writeText(props.value)
                toastSuccess?.("Copied")
              },
            },
            "Copy",
          )
          : null,
      ),
  }
})
