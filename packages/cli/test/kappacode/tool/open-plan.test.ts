import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { Agent } from "../../../src/agent/agent.ts"
import { TestInstance } from "../../fixture/fixture.ts"
import { OpenPlanTool } from "../../../src/kappacode/tool/open-plan.ts"
import { Session } from "../../../src/session/session.ts"
import { MessageID, SessionID } from "../../../src/session/schema.ts"
import { Truncate } from "../../../src/tool/truncate.ts"
import { Tool } from "../../../src/tool/tool.ts"
import { testEffect } from "../../lib/effect.ts"

const it = testEffect(
  LayerNode.compile(LayerNode.group([Agent.node, Session.node, SessionProjector.node, Truncate.node])),
)

const ctx = (sessionID: SessionID): Tool.Context => ({
  sessionID,
  messageID: MessageID.make("msg_open_plan"),
  agent: "plan",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

describe("open_plan", () => {
  it.instance(
    "returns the saved custom path and asks the client to open it",
    Effect.gen(function* () {
      const test = yield* TestInstance
      const sessions = yield* Session.Service
      const session = yield* sessions.create({})
      const file = path.join(test.directory, ".plans", "fix.md")
      yield* Effect.promise(() => Bun.write(file, "Do implementation step 1"))

      const info = yield* OpenPlanTool
      const tool = yield* Tool.init(info)
      const result = yield* tool.execute({ path: ".plans/fix.md" }, ctx(session.id))

      expect(result.metadata.plan.replaceAll(path.sep, "/")).toBe(".plans/fix.md")
      expect(result.metadata.open).toBe(true)
      expect(result.output.replaceAll(path.sep, "/")).toContain(".plans/fix.md")
    }),
    { git: true },
  )

  it.instance(
    "finds the current generated plan when no path is provided",
    Effect.gen(function* () {
      const test = yield* TestInstance
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "generated" })
      const file = path.join(test.directory, ".kappa", "plans", `${session.time.created}-generated.md`)
      yield* Effect.promise(() => Bun.write(file, "Do implementation step 1"))

      const info = yield* OpenPlanTool
      const tool = yield* Tool.init(info)
      const result = yield* tool.execute({}, ctx(session.id))

      expect(result.metadata.plan.replaceAll(path.sep, "/")).toBe(`.kappa/plans/${session.time.created}-generated.md`)
      expect(result.metadata.open).toBe(true)
    }),
    { git: true },
  )
})
