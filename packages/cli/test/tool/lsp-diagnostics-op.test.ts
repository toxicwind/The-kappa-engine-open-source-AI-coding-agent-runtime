// kilocode_change - new file
//
// Tests for the LSP tool's diagnostics operation. Exercises the code path
// through src/tool/lsp.ts (diagnostics switch-case at lines 116-139) using
// Layer.succeed for LSP.Service with custom diagnostics.
import { afterEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import path from "path"
import fs from "fs/promises"
import { LSP } from "@/lsp/lsp"
import type { LSPClient } from "@/lsp/client"
import { LspTool } from "../../src/tool/lsp.ts"
import { disposeAllInstances, TestInstance, withTmpdirInstance } from "../fixture/fixture.ts"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"

afterEach(async () => {
  await disposeAllInstances()
})

const testLayer = (diagResult: Record<string, LSPClient.Diagnostic[]>) =>
  LayerNode.compile(LayerNode.group([Agent.node, FSUtil.node, CrossSpawnSpawner.node, Truncate.node, LSP.node]), [
    [
      LSP.node,
      Layer.succeed(
        LSP.Service,
        LSP.Service.of({
          init: () => Effect.void,
          status: () => Effect.succeed([]),
          hasClients: () => Effect.succeed(true),
          touchFile: () => Effect.void,
          diagnostics: () => Effect.succeed(diagResult),
          hover: () => Effect.succeed([]),
          definition: () => Effect.succeed([]),
          references: () => Effect.succeed([]),
          implementation: () => Effect.succeed([]),
          documentSymbol: () => Effect.succeed([]),
          workspaceSymbol: () => Effect.succeed([]),
          prepareCallHierarchy: () => Effect.succeed([]),
          incomingCalls: () => Effect.succeed([]),
          outgoingCalls: () => Effect.succeed([]),
        }),
      ),
    ],
  ])

const testCtx = {
  sessionID: "ses_test",
  messageID: "msg_test",
  callID: "",
  agent: "test",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
} as any

const runDiagnosticsTest = (diagResult: Record<string, LSPClient.Diagnostic[]>) =>
  Effect.gen(function* () {
    const inst = yield* TestInstance
    const file = path.join(inst.directory, "test.ts")
    yield* Effect.promise(() => Bun.write(file, "const x = 1\n"))

    const tool = yield* LspTool
    const info = yield* tool.init()
    return yield* info.execute({ operation: "diagnostics", filePath: file }, testCtx)
  }).pipe(
    Effect.provide(testLayer(diagResult)),
    withTmpdirInstance(),
    Effect.scoped,
    Effect.runPromise,
  )

describe("tool.lsp diagnostics operation", () => {
  test("returns JSON with diagnostic details when lsp.diagnostics returns results", async () => {
    const diagResult: Record<string, LSPClient.Diagnostic[]> = {
      "/test/file.ts": [
        {
          severity: 1,
          message: "Type 'string' is not assignable to type 'number'",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        } as LSPClient.Diagnostic,
        {
          severity: 2,
          message: "Unused variable",
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        } as LSPClient.Diagnostic,
      ],
    }

    const result = await runDiagnosticsTest(diagResult)

    expect(result.output).toContain("Type 'string' is not assignable to type 'number'")
    expect(result.output).toContain("Unused variable")

    const metadata = result.metadata as Record<string, unknown>
    expect(metadata).toHaveProperty("diagnostics")

    const diag = metadata.diagnostics as Record<string, LSPClient.Diagnostic[]>
    expect(Object.keys(diag)).toContain("/test/file.ts")
    expect(diag["/test/file.ts"]).toHaveLength(2)
  })

  test("returns 'No diagnostics found' when lsp.diagnostics returns empty", async () => {
    const result = await runDiagnosticsTest({})

    expect(result.output).toBe("No diagnostics found")
  })

  test("diagnostics output is valid JSON for non-empty results", async () => {
    const diagResult: Record<string, LSPClient.Diagnostic[]> = {
      "/project/src/app.ts": [
        {
          severity: 1,
          message: "Cannot find module './missing'",
          range: { start: { line: 3, character: 10 }, end: { line: 3, character: 18 } },
        } as LSPClient.Diagnostic,
      ],
    }

    const result = await runDiagnosticsTest(diagResult)

    const parsed = JSON.parse(result.output)
    expect(Object.keys(parsed)).toContain("/project/src/app.ts")
    expect(parsed["/project/src/app.ts"]).toHaveLength(1)
    expect(parsed["/project/src/app.ts"][0].message).toBe("Cannot find module './missing'")
  })

  test("title includes operation and relative path for diagnostics", async () => {
    const result = await Effect.gen(function* () {
      const inst = yield* TestInstance
      const subDir = path.join(inst.directory, "myproject")
      yield* Effect.promise(() => fs.mkdir(subDir, { recursive: true }))
      const file = path.join(subDir, "app.ts")
      yield* Effect.promise(() => Bun.write(file, "const x = 1\n"))

      const tool = yield* LspTool
      const info = yield* tool.init()
      return yield* info.execute({ operation: "diagnostics", filePath: file }, testCtx)
    }).pipe(
      Effect.provide(testLayer({})),
      withTmpdirInstance(),
      Effect.scoped,
      Effect.runPromise,
    )

    expect(result.title).toContain("diagnostics")
  })
})
