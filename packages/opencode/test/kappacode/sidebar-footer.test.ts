import { describe, expect, test } from "bun:test"
import type { KappaPassState } from "@kappacode/kappa-gateway"
import type { Message } from "@kappacode/sdk/v2"

import { billable, creditLabel, format, passLine, resetLabel, scope } from "../../src/kappacode/plugins/sidebar-footer"

const kappaPass = {
  currentPeriodBaseCreditsUsd: 199,
  currentPeriodUsageUsd: 73.27,
  currentPeriodBonusCreditsUsd: 99.5,
  nextBillingAt: "2026-07-01T00:00:00.000Z",
} satisfies KappaPassState

const message = {
  id: "msg_1",
  sessionID: "ses_1",
  role: "assistant",
  time: { created: 1, completed: 2 },
  parentID: "msg_0",
  modelID: "kappa-auto/balanced",
  providerID: "kappa",
  mode: "build",
  agent: "build",
  path: { cwd: "/tmp", root: "/tmp" },
  cost: 0.1,
  tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
} satisfies Message

describe("Kappa sidebar footer", () => {
  test("formats money", () => {
    expect(format(12.345)).toBe("$12.35")
    expect(format(0)).toBe("$0.00")
  })

  test("labels balance scope", () => {
    expect(scope(null)).toEqual({ kind: "Personal" })
    expect(scope("org_1", [{ id: "org_1", name: "Acme" }])).toEqual({ kind: "Team", name: "Acme" })
    expect(creditLabel(scope(null))).toBe("Personal credits")
    expect(creditLabel(scope("org_1", [{ id: "org_1", name: "Acme" }]))).toBe("Acme team")
  })

  test("shows pass period usage and reset date", () => {
    expect(passLine(kappaPass)).toBe("$73 / $199")
    expect(resetLabel(kappaPass.nextBillingAt)).toBe("Jul 1")
    expect(resetLabel(null)).toBeUndefined()
    expect(resetLabel("not-a-date")).toBeUndefined()
  })

  test("refreshes only after completed billed Kappa turns", () => {
    expect(billable(message)).toBeTrue()
    expect(billable({ ...message, providerID: "anthropic" })).toBeFalse()
    expect(billable({ ...message, cost: 0 })).toBeFalse()
    expect(billable({ ...message, time: { created: 1 } })).toBeFalse()
  })
})
