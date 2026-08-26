import { createElement } from "react"
import { vi } from "vitest"
import "@testing-library/jest-dom/vitest"

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
