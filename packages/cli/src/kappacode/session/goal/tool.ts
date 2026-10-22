import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { GoalPolicy } from "./policy.ts"
import type { Goal } from "./runner.ts"

const Parameters = Schema.Struct({
  status: Schema.Literals(["complete", "blocked"]),
  reason: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
})

const ControlParameters = Schema.Struct({
  action: Schema.Literals(["start", "resume", "change", "pause", "clear"]).annotate({
    description:
      "Control the session Goal. start begins a new goal; resume continues a saved/paused one; change replaces the current objective; pause suspends the current goal (resumable); clear drops the current goal and cancels its timers.",
  }),
  objective: Schema.optional(
    Schema.String.annotate({
      description: "The objective for action start or change. Ignored for resume/pause/clear.",
    }),
  ),
})

export const GoalTool = Tool.define(
  "goal",
  Effect.succeed({
    description:
      "Start, resume, change, pause, or clear a session Goal so you keep working toward one objective across turns. start begins a new goal with a objective; resume continues a saved/paused goal; change replaces the current objective; pause suspends the current goal (resumable via resume); clear drops the goal and cancels its timers. After start/change the goal becomes active and the loop continues after this turn — give a short final response and report the outcome later with goal_report. Completion is your report, not independent verification. This tool does not grant permission or change scope.",
    parameters: ControlParameters,
    execute: (input: Schema.Schema.Type<typeof ControlParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (ctx.abort.aborted || !GoalPolicy.available(ctx.sessionID, "goal"))
          throw new Error("Goal control rejected: a goal is already active.")
        yield* ctx.ask({
          permission: "goal",
          patterns: [input.action],
          always: ["*"],
          metadata: { action: input.action, objective: input.objective },
        })
        const ops = ctx.extra?.["goalOps"] as Goal.Ops | undefined
        if (!ops) throw new Error("Goal control is unavailable in this runtime.")
        const result = yield* ops
          .arm({
            sessionID: ctx.sessionID,
            action: input.action,
            objective: input.objective,
          })
          .pipe(Effect.orDie)
        return {
          title:
            input.action === "start"
              ? "Goal started"
              : input.action === "change"
                ? "Goal changed"
                : input.action === "pause"
                  ? "Goal paused"
                  : input.action === "clear"
                    ? "Goal cleared"
                    : "Goal resumed",
          output:
            input.action === "pause"
              ? "Goal paused. Cancelled the armed wakeups and cron tasks. Use goal action resume to continue."
              : input.action === "clear"
                ? "Goal cleared. Cancelled the armed wakeups and cron tasks."
                : `Goal active: ${result.text}\nDo not continue this turn. Give a short final response; the goal loop continues automatically after this turn. Report completion or a blocker later with goal_report.`,
          metadata: { action: input.action, objective: result.text },
        }
      }),
  }),
)

export const GoalReportTool = Tool.define(
  "goal_report",
  Effect.succeed({
    description:
      "Report this active Goal as complete or blocked, with a concrete reason based on your work. This is your report, not independent verification. Only the Goal's root worker may report. A scheduled wait is not a blocker: when a wakeup, a cron task, or a background process can carry the goal forward, schedule it and the goal suspends until it fires instead of ending the goal. Report blocked only when no scheduled wait can help. Report after finishing work, then give your final response without further actions. The report is saved after the turn finishes; Stop, errors, or a replaced goal can invalidate it. This tool does not grant permission or change scope.",
    parameters: Parameters,
    execute: (input: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const reason = input.reason.trim()
        if (!reason || ctx.abort.aborted || !GoalPolicy.available(ctx.sessionID, "goal_report"))
          throw new Error("Goal report rejected: no active root Goal execution.")
        yield* ctx.ask({
          permission: "goal_report",
          patterns: [input.status],
          always: ["*"],
          metadata: { status: input.status, reason },
        })
        if (
          !reason ||
          ctx.abort.aborted ||
          !GoalPolicy.report(ctx.sessionID, ctx.messageID, { status: input.status, reason })
        )
          throw new Error("Goal report rejected: no matching active root Goal execution.")
        return {
          title: `Goal reported ${input.status}`,
          output:
            "Report recorded for this turn. Give your final response now. The Goal state is saved only if this execution remains current and finishes without an error or rejected request.",
          metadata: { status: input.status, reason },
        }
      }),
  }),
)
