import { describe, expect, it } from "vitest";
import { jsonEditorFitHeight } from "./json-editor-height.ts";

describe("jsonEditorFitHeight", () => {
  it("grows with line count and stays within min and max", () => {
    expect(jsonEditorFitHeight("{}", { min: 40, max: 200 })).toBe(40);
    expect(
      jsonEditorFitHeight('{\n  "a": 1\n}', { min: 40, max: 200 }),
    ).toBe(73);
    const tall = Array.from({ length: 80 }, (_, index) => `  "k${index}": 1,`)
      .join("\n");
    expect(jsonEditorFitHeight(tall, { min: 40, max: 200 })).toBe(200);
  });
});
