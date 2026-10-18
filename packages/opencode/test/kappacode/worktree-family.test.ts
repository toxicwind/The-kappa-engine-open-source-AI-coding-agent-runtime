import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { Git } from "../../src/git/index.ts"
import { InstanceRef } from "../../src/effect/instance-ref.ts"
import { WorktreeFamily } from "../../src/kappacode/worktree-family.ts"
import { Project } from "../../src/project/project.ts"
import { resetDatabase } from "../fixture/db.ts"
import { tmpdirScoped } from "../fixture/fixture.ts"
import { testEffect } from "../lib/effect.ts"

const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(Project.node), AppNodeBuilder.build(Git.node), AppNodeBuilder.build(CrossSpawnSpawner.node)))

describe("WorktreeFamily.list", () => {
  it.live("returns recorded sandboxes when git worktree listing fails", () =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.promise(() => resetDatabase()))
      const root = yield* tmpdirScoped()
      const sandbox = yield* tmpdirScoped()
      const project = yield* Project.Service
      const info = (yield* project.fromDirectory(root)).project
      yield* project.addSandbox(info.id, sandbox)

      const dirs = yield* WorktreeFamily.list().pipe(
        Effect.provideService(InstanceRef, {
          directory: root,
          worktree: root,
          project: { ...info, vcs: "git" },
        }),
      )

      expect(dirs).toEqual([root, sandbox])
    }),
  )
})
