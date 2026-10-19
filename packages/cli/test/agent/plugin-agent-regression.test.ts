import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { expect } from "bun:test"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import path from "path"
import { pathToFileURL } from "url"
import { Agent } from "../../src/agent/agent.ts"
import { EventV2Bridge } from "../../src/event-v2-bridge.ts"
import { Config } from "../../src/config/config.ts"
import { Env } from "../../src/env/index.ts"
import { Git } from "../../src/git/index.ts" // kappacode_change
import { RuntimeFlags } from "../../src/effect/runtime-flags.ts"
import { MCP } from "../../src/mcp/index.ts" // kappacode_change
import { Plugin } from "../../src/plugin/index.ts"
import { AccountTest } from "../fake/account.ts"
import { AuthTest } from "../fake/auth.ts"
import { NpmTest } from "../fake/npm.ts"
import { ProviderTest } from "../fake/provider.ts"
import { SkillTest } from "../fake/skill.ts"
import { testEffect } from "../lib/effect.ts"
import { PLUGIN_AGENT } from "../fixture/agent-plugin.constants.ts"
import { Auth } from "../../src/auth/index.ts"
import { Account } from "../../src/account/account.ts"
import { Npm } from "@opencode-ai/core/npm"
import { Skill } from "../../src/skill/index.ts"
import { Provider } from "../../src/provider/provider.ts"

// `it.instance` skips InstanceBootstrap so LSP / MCP don't spin up — those
// services hang during scope teardown on Windows and aren't needed
// to verify plugin → config hook → Agent.list.
const pluginUrl = pathToFileURL(path.join(import.meta.dir, "..", "fixture", "agent-plugin.ts")).href

const provider = ProviderTest.fake()
const configLayer = AppNodeBuilder.build(Config.node, [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
])
const pluginLayer = AppNodeBuilder.build(Plugin.node, [
  [Config.node, configLayer],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
])
const dependencies = Layer.mergeAll(configLayer, pluginLayer).pipe(Layer.provideMerge(configLayer))
const agentLayer = AppNodeBuilder.build(Agent.node, [
  [Auth.node, AuthTest.empty],
  [Skill.node, SkillTest.empty],
  [MCP.node, Layer.mock(MCP.Service)({})], // kappacode_change
  [Provider.node, provider.layer],
  [Plugin.node, pluginLayer],
  [Config.node, configLayer],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
])
const layer = Layer.mergeAll(agentLayer, dependencies).pipe(Layer.provideMerge(dependencies))

const it = testEffect(layer)

it.instance(
  "plugin-registered agents appear in Agent.list",
  () =>
    Effect.gen(function* () {
      yield* Plugin.Service.use((p) => p.init())
      const agents = yield* Agent.use.list()
      const added = agents.find((agent) => agent.name === PLUGIN_AGENT.name)
      expect(added?.description).toBe(PLUGIN_AGENT.description)
      expect(added?.mode).toBe(PLUGIN_AGENT.mode)
    }),
  { config: { plugin: [pluginUrl] } },
)
