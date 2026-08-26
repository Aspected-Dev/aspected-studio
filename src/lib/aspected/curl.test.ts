import { describe, expect, it } from "vitest"
import { buildCurlCommand } from "./curl.ts"

describe("buildCurlCommand", () => {
  it("builds a GET without a body", () => {
    expect(
      buildCurlCommand({
        method: "GET",
        url: "http://localhost:8080/indexes",
      }),
    ).toBe("curl 'http://localhost:8080/indexes'")
  })

  it("includes method, JSON body, and headers", () => {
    const command = buildCurlCommand({
      method: "PUT",
      url: "http://localhost:8080/indexes/products",
      headers: { Authorization: "Bearer secret" },
      body: { idSize: 36, schema: [] },
    })

    expect(command).toContain("-X PUT")
    expect(command).toContain("-H 'Authorization: Bearer secret'")
    expect(command).toContain("-H 'Content-Type: application/json'")
    expect(command).toContain('"idSize": 36')
  })
})
