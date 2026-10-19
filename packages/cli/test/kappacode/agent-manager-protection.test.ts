import { describe, expect, test } from "bun:test"
import { assertMutablePath } from "@/kappacode/agent-manager/protection"

describe("Agent Manager state protection", () => {
  test("rejects direct edits to Agent Manager state", () => {
    expect(() => assertMutablePath("/workspace/.kappa/agent-manager.json")).toThrow(
      "Do not edit Agent Manager state directly",
    )
    expect(() => assertMutablePath("/workspace/.kappacode/agent-manager.json")).toThrow(
      "Do not edit Agent Manager state directly",
    )
  })

  test("allows ordinary project files", () => {
    expect(() => assertMutablePath("/workspace/.kappa/settings.json")).not.toThrow()
    expect(() => assertMutablePath("/workspace/src/agent-manager.json")).not.toThrow()
  })
})
