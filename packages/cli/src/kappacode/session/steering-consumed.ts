import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import type { Config } from "@/config/config"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import type { MessageID, SessionID } from "@/session/schema"
import { BoardEnabled } from "@/kappacode/board/enabled"
import { BoardStore } from "@/kappacode/board/store"
import { KappaSessionSteering } from "@/kappacode/session/steering"
import { KappaSessionPromptQueue } from "@/kappacode/session/prompt-queue"

type Part = { type: string; text?: string; synthetic?: boolean; metadata?: Record<string, unknown> }

/** Body marker a steering agent uses to recognize a consumed confirmation. */
export const MARKER = "steer_consumed"

/**
 * Steers notified to a parent (via KappaSessionSteering.notify) but not yet
 * confirmed as consumed by the child's turn. Keyed by child session, then the
 * steer's own message ID, mapping to the parent session. A steer is removed
 * once its consuming turn confirms it, so each steer is confirmed exactly once.
 */
const pending = new Map<SessionID, Map<MessageID, SessionID>>()

/**
 * Record a steer that was admitted so its consuming turn can confirm it later.
 * Called at admission (in turn), after notify(). Only a genuinely human steer
 * (marked parts from a child with a parent) is registered, mirroring notify().
 */
export const mark = Effect.fn("SteeringConsumed.mark")(function* (input: {
  session: { id: SessionID; parentID?: SessionID }
  parts: ReadonlyArray<Part>
  messageID: MessageID
}) {
  const parent = input.session.parentID
  if (!parent) return
  if (!KappaSessionSteering.text(input.parts)) return
  let per = pending.get(input.session.id)
  if (!per) {
    per = new Map()
    pending.set(input.session.id, per)
  }
  per.set(input.messageID, parent)
  return yield* Effect.void
})

/**
 * Confirm that a previously admitted steer was actually consumed: post a board
 * INFO from the child to its parent carrying the [steer_consumed] marker and
 * the steer's message ID, so the parent can correlate admission (notify) with
 * consumption and know the runtime genuinely took the steer. Call inside
 * runLoop when the queued steer slot starts running. Failures are logged and
 * never fail the turn. Each steer is confirmed at most once.
 *
 * KV-steer synthesis: the confirmation fires at the same provider-turn boundary
 * where an LLM request breaks its rolling prompt cache to inject the freshly
 * steered (volatile) context (borrow A — tau cache_control rolling prefix:
 * stable prefix cached, volatile steer tail kept outside the cacheable head).
 * As a result this receipt is truthful by construction: it is posted only once
 * the runLoop that will issue that cache-broken request is actually processing
 * the steer, never on mere admission. The body's steer message ID is the stable
 * correlation key a provider-agnostic consumer (borrow B — ai-proxy route with
 * model-registry fallback) can surface as "steer consumed" state without
 * depending on which provider served the turn.
 */
export const confirm = Effect.fn("SteeringConsumed.confirm")(function* (input: {
  sessionID: SessionID
  config: Config.Interface
  flags: RuntimeFlags.Info
  database: Database.Interface
}) {
  const active = KappaSessionPromptQueue.active(input.sessionID)
  if (!active) return
  const per = pending.get(input.sessionID)
  const parent = per?.get(active)
  if (!per || !parent) return
  per.delete(active)
  if (per.size === 0) pending.delete(input.sessionID)
  if (!BoardEnabled.on(yield* input.config.get(), input.flags)) return
  yield* BoardStore.post({
    sessionID: input.sessionID,
    messageID: `${active}#consumed`,
    to: parent,
    type: "INFO",
    body: `[${MARKER}] steer ${active} consumed`,
  }).pipe(
    Effect.provideService(Database.Service, input.database),
    Effect.catch((err) =>
      Effect.logWarning("subagent steering consumed confirmation failed", { "session.id": input.sessionID, err }),
    ),
  )
})

export * as SteeringConsumed from "./steering-consumed.ts"
