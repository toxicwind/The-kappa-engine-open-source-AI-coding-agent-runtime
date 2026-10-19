// kappacode_change - new file
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { expect } from "bun:test"
import { Effect } from "effect"
import { testEffect } from "../lib/effect.ts"
import { Agent } from "../../src/agent/agent.ts"
import { Permission } from "../../src/permission/index.ts"
import { Global } from "@opencode-ai/core/global"

const it = testEffect(AppNodeBuilder.build(Agent.node))

it.instance("code agent allows global config directory reads by default", () =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const code = yield* agent.get("code")
    expect(code).toBeDefined()
    expect(Permission.evaluate("external_directory", `${Global.Path.config}/*`, code!.permission).action).toBe("allow")
  }),
)
