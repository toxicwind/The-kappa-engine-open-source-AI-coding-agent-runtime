import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { KappaModeReminders } from "@/kappacode/session/mode-reminders" // kappacode_change
import { Session } from "./session.ts"

export const apply = Effect.fn("SessionReminders.apply")(function* (input: {
  messages: SessionV1.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  // kappacode_change start - mode reminder policy (plan, ask, code switches) lives in kappacode/session/mode-reminders.ts
  return yield* KappaModeReminders.apply(input)
  // kappacode_change end
})

export * as SessionReminders from "./reminders.ts"
