import { Schema } from "effect"
import { zod } from "@opencode-ai/core/effect-zod"
import { SessionID, MessageID } from "./schema.ts"

/**
 * LoopInput extracted into a leaf module to break a Bun-bundler cycle.
 *
 * `prompt.ts` imports `runLoop` (value) from `run-loop.ts`, while
 * `run-loop.ts` imported `LoopInput` (a runtime `Schema.Class`) from
 * `prompt.ts`. Under Bun's `splitting:false` compilation that mutual
 * load-order edge caused the bundler to drop `run-loop.ts` from the binary
 * entirely (its export resolved `undefined` at runtime → "X.pipe is not a
 * function" in the 500 middleware at `session/prompt.ts:1614`). Nothing in
 * this leaf imports back into `prompt.ts`, so both consumers load cleanly.
 */
export class LoopInput extends Schema.Class<LoopInput>("SessionPrompt.LoopInput")({
  sessionID: SessionID,
  resume: Schema.optional(MessageID), // kappacode_change
  snapshotInitialization: Schema.optional(Schema.Literal("wait")), // kappacode_change
}) {
  static readonly zod = zod(this)
}