import { describe, it, expect } from "bun:test"
import { narrationGuard, type TurnInput } from "@/kappacode/flail-gate"

function input(over: Partial<TurnInput>): TurnInput {
  return {
    turn: 1,
    runId: "run-test",
    ...over,
  } as TurnInput
}

describe("narrationGuard — error-loop brake", () => {
  it("fires on 3+ consecutive failed tool calls with zero receipts", () => {
    const res = narrationGuard(
      input({
        reasoning: "git diff --no-index --cached should work",
        toolCalls: [
          { name: "bash", ok: false },
          { name: "bash", ok: false },
          { name: "bash", ok: false },
        ],
        receipts: [],
      }),
    )
    expect(res.action).toBe("continue")
    expect(res.reason).toBe("error-loop")
    expect(res.inject).toContain("ERROR_LOOP_BRAKE")
  })

  it("does not fire below 3 calls", () => {
    const res = narrationGuard(
      input({
        toolCalls: [
          { name: "bash", ok: false },
          { name: "bash", ok: false },
        ],
        receipts: [],
      }),
    )
    expect(res.reason).not.toBe("error-loop")
  })

  it("does not fire when any call succeeded", () => {
    const res = narrationGuard(
      input({
        toolCalls: [
          { name: "bash", ok: false },
          { name: "read", ok: true },
          { name: "bash", ok: false },
        ],
        receipts: ["r1"],
      }),
    )
    expect(res.reason).not.toBe("error-loop")
  })

  it("does not fire when receipts exist despite ok flags", () => {
    const res = narrationGuard(
      input({
        toolCalls: [
          { name: "bash", ok: false },
          { name: "bash", ok: false },
          { name: "bash", ok: false },
        ],
        receipts: ["r1"],
      }),
    )
    expect(res.reason).not.toBe("error-loop")
  })
})
