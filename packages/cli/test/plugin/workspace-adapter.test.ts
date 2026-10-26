import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import path from "path"
import { pathToFileURL } from "url"
import { Auth } from "../../src/auth/index.ts"
import { EventV2Bridge } from "../../src/event-v2-bridge.ts"
import { Config } from "../../src/config/config.ts"
import { Env } from "../../src/env/index.ts"
import { Git } from "../../src/git/index.ts" // kappacode_change
import { RuntimeFlags } from "../../src/effect/runtime-flags.ts"
import { Workspace } from "../../src/control-plane/workspace.ts"
import { Plugin } from "../../src/plugin/index.ts"
import { InstanceBootstrap } from "../../src/project/bootstrap-service.ts"
import { InstanceBootstrap as InstanceBootstrapNode } from "../../src/project/bootstrap.ts"
import { InstanceStore } from "../../src/project/instance-store.ts"
import { Project } from "../../src/project/project.ts"
import { Vcs } from "../../src/project/vcs.ts"
import { InstanceState } from "../../src/effect/instance-state.ts"
import { Session } from "../../src/session/session.ts"
import { SessionPrompt } from "../../src/session/prompt.ts"
import { disposeAllInstances, TestInstance } from "../fixture/fixture.ts"
import { testEffect } from "../lib/effect.ts"
import { AccountTest } from "../fake/account.ts"
import { AuthTest } from "../fake/auth.ts"
import { NpmTest } from "../fake/npm.ts"
import { Account } from "../../src/account/account.ts"
import { Npm } from "@opencode-ai/core/npm"

const configLayer = AppNodeBuilder.build(Config.node, [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
])
const pluginLayer = AppNodeBuilder.build(Plugin.node, [
  [Config.node, configLayer],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
])
const noopBootstrapLayer = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const workspaceLayer = AppNodeBuilder.build(Workspace.node, [
  [InstanceBootstrapNode.node, noopBootstrapLayer],
  [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: true })],
])
const it = testEffect(
  Layer.mergeAll(pluginLayer, workspaceLayer, AppNodeBuilder.build(CrossSpawnSpawner.node)).pipe(Layer.provide(AppNodeBuilder.build(Ripgrep.node))),
)

afterEach(async () => {
  await disposeAllInstances()
})

describe("plugin.workspace", () => {
  it.instance("plugin can install a workspace adapter", () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      const type = `plug-${Math.random().toString(36).slice(2)}`
      const file = path.join(dir, "plugin.ts")
      const mark = path.join(dir, "created.json")
      const space = path.join(dir, "space")
      yield* Effect.promise(() =>
        Bun.write(
          file,
          [
            "export default async ({ experimental_workspace }) => {",
            `  experimental_workspace.register(${JSON.stringify(type)}, {`,
            '    name: "plug",',
            '    description: "plugin workspace adapter",',
            "    configure(input) {",
            `      return { ...input, name: "plug", branch: "plug/main", directory: ${JSON.stringify(space)} }`,
            "    },",
            "    async create(input) {",
            `      await Bun.write(${JSON.stringify(mark)}, JSON.stringify(input))`,
            "    },",
            "    async remove() {},",
            "    target(input) {",
            '      return { type: "local", directory: input.directory }',
            "    },",
            "  })",
            "  return {}",
            "}",
            "",
          ].join("\n"),
        ),
      )

      yield* Effect.promise(() =>
        Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify(
            {
              $schema: "https://opencode.ai/config.json",
              plugin: [pathToFileURL(file).href],
            },
            null,
            2,
          ),
        ),
      )

      const plugin = yield* Plugin.Service
      yield* plugin.init()
      const workspace = yield* Workspace.Service
      const ctx = yield* InstanceState.context
      const info = yield* workspace.create({
        type,
        branch: null,
        extra: { key: "value" },
        projectID: ctx.project.id,
      })

      expect(info.type).toBe(type)
      expect(info.name).toBe("plug")
      expect(info.branch).toBe("plug/main")
      expect(info.directory).toBe(space)
      expect(info.extra).toEqual({ key: "value" })
      expect(JSON.parse(yield* Effect.promise(() => Bun.file(mark).text()))).toMatchObject({
        type,
        name: "plug",
        branch: "plug/main",
        directory: space,
        extra: { key: "value" },
      })
    }),
  )
})
