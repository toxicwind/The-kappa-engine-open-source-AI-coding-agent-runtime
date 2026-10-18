import { describe, expect, test } from "bun:test"
import { KappaSessionProcessor } from "../../../src/kappacode/session/processor.ts"

describe("reasoning_content handling for reasoning models", () => {
  test("observe marks attempt.text=true on reasoning-delta", () => {
    const attempt = KappaSessionProcessor.attempt()
    const event = { type: "reasoning-delta", id: "r1", text: "  let me think  " } as any
    KappaSessionProcessor.observe(attempt, event)
    expect(attempt.text).toBe(true)
    expect(attempt.reasoning).toBe(true)
  })

  test("observe does not mark attempt.text on empty reasoning-delta", () => {
    const attempt = KappaSessionProcessor.attempt()
    const event = { type: "reasoning-delta", id: "r1", text: "   " } as any
    KappaSessionProcessor.observe(attempt, event)
    expect(attempt.text).toBe(false)
    expect(attempt.reasoning).toBe(false)
  })

  test("replayable returns true for reasoning-only unknown finish", () => {
    expect(
      KappaSessionProcessor.replayable({ finish: "unknown", text: false, reasoning: true, tool: false, usage: false }),
    ).toBe(true)
  })

  test("replayable returns false when text present", () => {
    expect(
      KappaSessionProcessor.replayable({ finish: "unknown", text: true, reasoning: true, tool: false, usage: false }),
    ).toBe(false)
  })

  test("replayable returns false when tool present", () => {
    expect(
      KappaSessionProcessor.replayable({ finish: "unknown", text: false, reasoning: true, tool: true, usage: false }),
    ).toBe(false)
  })

  test("replayable returns false when finish is defined and not unknown", () => {
    expect(
      KappaSessionProcessor.replayable({ finish: "stop", text: false, reasoning: true, tool: false, usage: false }),
    ).toBe(false)
  })

  test("lengthWarning returns warning for length stop with reasoning-only output", () => {
    const warn = KappaSessionProcessor.lengthWarning({
      msg: { finish: "length", summary: undefined } as any,
      step: { reasoning: true, text: false, tool: false },
    })
    expect(warn).toBeTruthy()
    expect(typeof warn).toBe("string")
    expect(warn).toContain("reasoning")
  })

  test("lengthWarning returns OUTPUT_LENGTH_WARNING when text present on length stop", () => {
    const warn = KappaSessionProcessor.lengthWarning({
      msg: { finish: "length", summary: undefined } as any,
      step: { reasoning: true, text: true, tool: false },
    })
    expect(warn).toBeTruthy()
    expect(typeof warn).toBe("string")
    expect(warn).not.toContain("reasoning")
  })

  test("lengthWarning returns undefined when not length stop", () => {
    const warn = KappaSessionProcessor.lengthWarning({
      msg: { finish: "stop", summary: undefined } as any,
      step: { reasoning: true, text: false, tool: false },
    })
    expect(warn).toBeUndefined()
  })
})
