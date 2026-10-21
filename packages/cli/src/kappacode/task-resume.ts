import { type SeedSnapshot, buildResumeHint as buildSeedResumeHint } from "./orchestrator-seed"

/**
 * Generate a resume hint for a failed/resumed subagent.
 *
 * If a `seedSnapshot` is provided, the hint includes a compact snapshot of
 * the orchestrator's state at failure time — subagent counts, latest board
 * activity, file changes, and failed agent IDs — so the resumed subagent
 * starts with ground truth about the live environment.
 *
 * Without a seed, this falls back to the basic session-ID hint.
 */
export function resumeHint(sessionID: string, seedSnapshot?: SeedSnapshot | null): string {
  const baseHint = [
    `This subagent session can be resumed: call the task tool again with task_id="${sessionID}"`,
    `and a prompt describing how to continue or recover. Its prior context is preserved.`,
  ].join(" ")

  if (!seedSnapshot) return baseHint

  try {
    const seedHint = buildSeedResumeHint(seedSnapshot, `Resumed from failed subagent ${sessionID}.`)
    return `${baseHint}\n\n${seedHint}`
  } catch {
    // If seed formatting fails, fall back to the basic hint
    return baseHint
  }
}
