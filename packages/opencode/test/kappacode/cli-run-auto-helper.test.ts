// kappacode_change - new file
import { describe, expect, test } from "bun:test"
import { KappaRunAuto } from "../../src/kappacode/cli/run-auto.ts"

describe("KappaRunAuto", () => {
  test("tracks task child sessions without allowing unrelated sessions", () => {
    const state = KappaRunAuto.create("ses_root")

    expect(KappaRunAuto.allowed(state, "ses_root")).toBe(true)
    expect(KappaRunAuto.allowed(state, "ses_child")).toBe(false)

    KappaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_root",
      state: {
        metadata: {
          sessionId: "ses_child",
        },
      },
    })

    expect(KappaRunAuto.allowed(state, "ses_child")).toBe(true)
    KappaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_child",
      state: { metadata: { sessionId: "ses_grandchild" } },
    })
    expect(KappaRunAuto.allowed(state, "ses_grandchild")).toBe(true)
    expect(KappaRunAuto.allowed(state, "ses_other")).toBe(false)
  })

  test("ignores malformed or untrusted task metadata", () => {
    const state = KappaRunAuto.create("ses_root")

    KappaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_root",
      state: {
        metadata: {
          sessionId: "",
        },
      },
    })
    KappaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_other",
      state: {
        metadata: {
          sessionId: "ses_wrong",
        },
      },
    })
    KappaRunAuto.track(state, {
      type: "text",
      sessionID: "ses_root",
      state: {},
    })

    expect(KappaRunAuto.allowed(state, "ses_wrong")).toBe(false)
    expect(KappaRunAuto.allowed(state, "")).toBe(false)
  })
})
