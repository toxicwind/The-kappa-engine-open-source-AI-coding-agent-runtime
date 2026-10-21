/**
 * orchestrator-seed.ts — Precompaction seed generator for Kappa subagents.
 *
 * Purpose:
 *   When a subagent fails or resumes, it starts with zero context about what
 *   the orchestrator was doing. This module captures the orchestrator's current
 *   state into a compact (~≤2 KB) "seed" that gets injected into every
 *   subagent's initial prompt, giving the new subagent ground truth about the
 *   live environment.
 *
 * Design:
 *   - `generateSeed()` is a PURE function: it receives pre-fetched data and
 *     returns a serializable object. No I/O at call site.
 *   - `formatSeed()` serializes the snapshot to a compact text block.
 *   - `enforceBudget()` hard-caps output at SEED_MAX_CHARS (2 KB).
 *   - `buildResumeHint()` appends a seed-aware recovery note to the failure
 *     text so resumed subagents get state even when the full seed block can't
 *     fit in the prompt.
 *
 * Integration (see task.ts / prompt.ts for details):
 *   1. task.ts calls generateSeed() + formatSeed() → text block
 *   2. task.ts prepends seed text to parts[] before ops.prompt()
 *   3. task-resume.ts calls buildResumeHint() → appends to failure text
 *
 * Seed format (human-readable, token-efficient, unambiguous for LLM parsing):
 *   - Sections separated by blank lines
 *   - Section headers use [LABEL] convention
 *   - Key-value pairs use | delimiter
 *   - Arrays use one entry per line
 *   - Total budget: SEED_MAX_CHARS (2048)
 */

// ── version / budget ────────────────────────────────────────────────────────

/** Current seed format version. Bump when the text format changes. */
export const SEED_VERSION = 1

/** Maximum characters for the serialized seed text. */
export const SEED_MAX_CHARS = 2_048

// ── public types ────────────────────────────────────────────────────────────

/**
 * Snapshot of the orchestrator's state at a point in time.
 * All fields are serializable to plain JSON.
 */
export interface SeedSnapshot {
  /** Format version */
  v: number

  /** Capture timestamp (epoch ms) */
  ts: number

  /** Task-level summary */
  task: {
    /** Short identifier for the orchestrator's task */
    id: string
    /** One-sentence goal brief */
    goalBrief: string
    /** Counts by status */
    subagentCounts: SubagentCounts
  }

  /** Active subagents (sorted: failed > running > idle, capped) */
  subagents: Array<SubagentInfo>

  /** Latest board activity (capped) */
  board: {
    totalMessages: number
    recentMessages: Array<BoardMessage>
  }

  /** Pending work items (capped) */
  pendingWork: Array<WorkItem>

  /** Filesystem changes since last checkpoint (capped) */
  fileChanges: FileChanges

  /** Live service health (capped) */
  services: Array<ServiceInfo>
}

export interface SubagentCounts {
  running: number
  pending: number
  completed: number
  failed: number
}

export interface SubagentInfo {
  id: string
  task_id: string
  status: "running" | "pending" | "completed" | "failed" | "resuming"
  model: string
  provider: string
  /** Last 2 lines of output, if any */
  lastActivity: string | null
  /** Milliseconds since last activity, or null if unknown */
  idleMs: number | null
}

export interface BoardMessage {
  from: string
  type: "INFO" | "ASK" | "RESULT" | "HOLD" | "VETO"
  body: string
  ts: number
}

export interface WorkItem {
  description: string
  priority: "high" | "medium" | "low"
  blockedBy?: string
}

export interface FileChanges {
  modified: string[]
  added: string[]
  deleted: string[]
  gitAvailable: boolean
}

export interface ServiceInfo {
  name: string
  port: number | null
  status: "up" | "down" | "unknown"
  note: string | null
}

// ── input type for the pure generator ───────────────────────────────────────

/**
 * Raw input that the orchestrator layer gathers before calling `generateSeed`.
 * This is NOT the snapshot itself — it's the pre-fetched data that feeds into
 * the pure generator function.
 */
export interface SeedInput {
  taskId: string
  goalBrief: string
  subagents: Array<{
    id: string
    task_id: string
    status: string
    model: string
    provider: string
    lastActivity: string | null
    idleMs: number | null
  }>
  boardMessages: Array<{
    from: string
    type: string
    body: string
    ts: number
  }>
  pendingWork: Array<{
    description: string
    priority: string
    blockedBy?: string
  }>
  fileChanges: {
    modified: string[]
    added: string[]
    deleted: string[]
    gitAvailable: boolean
  }
  services: Array<{
    name: string
    port: number | null
    status: string
    note: string | null
  }>
}

// ── status priority ordering ────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  failed: 0,
  resuming: 1,
  running: 2,
  pending: 3,
  completed: 4,
}

function statusOrder(s: string): number {
  return STATUS_PRIORITY[s] ?? 5
}

// ── constants for truncation ────────────────────────────────────────────────

const MAX_SUBAGENTS = 5
const MAX_BOARD_MESSAGES = 5
const MAX_PENDING_WORK = 3
const MAX_FILE_MODIFIED = 8
const MAX_FILE_ADDED = 4
const MAX_FILE_DELETED = 2
const MAX_SERVICES = 3

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Generate a SeedSnapshot from pre-fetched input.
 *
 * This is a PURE function — no I/O, no side effects. The orchestrator layer
 * is responsible for gathering the raw data before calling this function.
 */
export function generateSeed(input: SeedInput): SeedSnapshot {
  const now = Date.now()

  // Sort and cap subagents: failed > resuming > running > pending > completed
  const sortedSubagents = [...input.subagents]
    .sort((a, b) => {
      const sa = statusOrder(a.status)
      const sb = statusOrder(b.status)
      if (sa !== sb) return sa - sb
      // Within same status, sort by idle time (newer first)
      const ia = a.idleMs ?? Infinity
      const ib = b.idleMs ?? Infinity
      return ia - ib
    })
    .slice(0, MAX_SUBAGENTS)

  // Cap board messages (already sorted newest-first by caller)
  const recentMessages = input.boardMessages.slice(0, MAX_BOARD_MESSAGES)

  // Cap pending work
  const work = input.pendingWork.slice(0, MAX_PENDING_WORK)

  // Cap file changes
  const modified = input.fileChanges.modified.slice(0, MAX_FILE_MODIFIED)
  const added = input.fileChanges.added.slice(0, MAX_FILE_ADDED)
  const deleted = input.fileChanges.deleted.slice(0, MAX_FILE_DELETED)

  // Cap services
  const services = input.services.slice(0, MAX_SERVICES)

  // Count statuses from sorted (capped) list
  const counts: SubagentCounts = { running: 0, pending: 0, completed: 0, failed: 0 }
  for (const sa of sortedSubagents) {
    if (sa.status === "running") counts.running++
    else if (sa.status === "pending") counts.pending++
    else if (sa.status === "completed") counts.completed++
    else if (sa.status === "failed") counts.failed++
  }

  // Map raw string statuses to discriminates
  const safeSubagents: SubagentInfo[] = sortedSubagents.map((sa) => ({
    ...sa,
    status: sa.status as SubagentInfo["status"],
  }))

  const safeMessages: BoardMessage[] = recentMessages.map((m) => ({
    ...m,
    type: m.type as BoardMessage["type"],
    body: m.body.length > 120 ? m.body.slice(0, 117) + "..." : m.body,
  }))

  const safeWork: WorkItem[] = work.map((w) => ({
    ...w,
    priority: w.priority as WorkItem["priority"],
  }))

  const safeServices: ServiceInfo[] = services.map((s) => ({
    ...s,
    status: s.status as ServiceInfo["status"],
  }))

  return {
    v: SEED_VERSION,
    ts: now,
    task: {
      id: input.taskId,
      goalBrief: input.goalBrief.length > 120 ? input.goalBrief.slice(0, 117) + "..." : input.goalBrief,
      subagentCounts: counts,
    },
    subagents: safeSubagents,
    board: {
      totalMessages: input.boardMessages.length,
      recentMessages: safeMessages,
    },
    pendingWork: safeWork,
    fileChanges: { modified, added, deleted, gitAvailable: input.fileChanges.gitAvailable },
    services: safeServices,
  }
}

/**
 * Serialize a SeedSnapshot to a compact text block suitable for injection
 * into a subagent's prompt.
 *
 * Uses a structured, delimiter-based format — not JSON (too many quotes)
 * and not freeform (too ambiguous). Each section is self-describing with
 * [SECTION] headers and key-value pairs separated by |.
 *
 * Output is hard-capped at SEED_MAX_CHARS via `enforceBudget`.
 */
export function formatSeed(snapshot: SeedSnapshot): string {
  const lines: string[] = []

  // Header
  const dateStr = new Date(snapshot.ts)
    .toISOString()
    .replace(/T/, " ")
    .replace(/\.\d+Z/, "")
  lines.push(`## SEED [v=${snapshot.v}] captured ${dateStr}`)
  lines.push("")

  // Task summary
  lines.push(`TASK: ${snapshot.task.id}`)
  lines.push(`  brief: ${snapshot.task.goalBrief}`)
  const c = snapshot.task.subagentCounts
  lines.push(`  subagents: ${c.running} running, ${c.pending} pending, ${c.completed} completed, ${c.failed} failed`)
  lines.push("")

  // Subagents
  if (snapshot.subagents.length > 0) {
    lines.push("SUBAGENTS:")
    for (const sa of snapshot.subagents) {
      const idle = sa.idleMs ? `${Math.round(sa.idleMs / 1000)}s` : "?"
      lines.push(`  [${sa.status.toUpperCase()}] ${sa.id} | model=${sa.model} | provider=${sa.provider} | idle=${idle}`)
      if (sa.lastActivity) {
        lines.push(
          `    last: "${sa.lastActivity.length > 80 ? sa.lastActivity.slice(0, 77) + "..." : sa.lastActivity}"`,
        )
      }
    }
    lines.push("")
  }

  // Board
  if (snapshot.board.recentMessages.length > 0) {
    lines.push(`BOARD (total: ${snapshot.board.totalMessages} msgs, showing ${snapshot.board.recentMessages.length}):`)
    for (const msg of snapshot.board.recentMessages) {
      lines.push(`  [${msg.type}] ${msg.from}: "${msg.body}"`)
    }
    lines.push("")
  }

  // Pending work
  if (snapshot.pendingWork.length > 0) {
    lines.push("PENDING WORK:")
    for (const w of snapshot.pendingWork) {
      const block = w.blockedBy ? ` (blocked by ${w.blockedBy})` : ""
      lines.push(`  [${w.priority}] ${w.description}${block}`)
    }
    lines.push("")
  }

  // File changes
  const allFiles: string[] = []
  for (const f of snapshot.fileChanges.modified) allFiles.push(`M ${f}`)
  for (const f of snapshot.fileChanges.added) allFiles.push(`A ${f}`)
  for (const f of snapshot.fileChanges.deleted) allFiles.push(`D ${f}`)
  if (allFiles.length > 0) {
    lines.push(`FILES CHANGED (git: ${snapshot.fileChanges.gitAvailable ? "yes" : "no"}):`)
    for (const f of allFiles) lines.push(`  ${f}`)
    lines.push("")
  }

  // Services
  if (snapshot.services.length > 0) {
    lines.push("SERVICES:")
    for (const s of snapshot.services) {
      const note = s.note ? ` (${s.note})` : ""
      const port = s.port ? `:${s.port} ` : ""
      lines.push(`  ${s.name} ${port}${s.status}${note}`)
    }
    lines.push("")
  }

  const text = lines.join("\n")
  return enforceBudget(text)
}

/**
 * Build a resume hint string that includes a compact seed snapshot.
 * Called when a subagent fails — this text gets appended to the failure
 * message so that when the orchestrator retries with the same task_id,
 * the subagent sees state about what happened.
 */
export function buildResumeHint(snapshot: SeedSnapshot, failureReason: string): string {
  const lines: string[] = []
  lines.push(failureReason)
  lines.push("")
  lines.push(`[RECOVERY CONTEXT — seed v=${snapshot.v}]`)

  const c = snapshot.task.subagentCounts
  lines.push(
    `Subagents at failure: ${c.running} running, ${c.pending} pending, ${c.completed} completed, ${c.failed} failed`,
  )

  // Latest board message
  const latestBoard = snapshot.board.recentMessages[0]
  if (latestBoard) {
    lines.push(`Latest board: [${latestBoard.type}] ${latestBoard.from}: "${latestBoard.body}"`)
  }

  // Failed subagent IDs
  const failedIds = snapshot.subagents.filter((s) => s.status === "failed").map((s) => s.id)
  if (failedIds.length > 0) lines.push(`Failed agents: ${failedIds.join(", ")}`)

  // File changes
  if (snapshot.fileChanges.modified.length > 0) {
    lines.push(`Files changed: ${snapshot.fileChanges.modified.slice(0, 4).join(", ")}`)
  }

  lines.push("[END RECOVERY CONTEXT]")
  return lines.join("\n")
}

// ── budget enforcement ──────────────────────────────────────────────────────

/**
 * Hard-cap the serialized seed text at SEED_MAX_CHARS.
 *
 * Uses a priority-based removal cascade: drop least-useful sections first,
 * then trim fields, then hard-truncate with a marker.
 */
export function enforceBudget(text: string): string {
  if (text.length <= SEED_MAX_CHARS) return text

  let result = text

  // 1. Drop services section (least useful for subagent context)
  result = removeSection(result, "SERVICES:")
  if (result.length <= SEED_MAX_CHARS) return result

  // 2. Drop file changes section
  result = removeSection(result, "FILES CHANGED")
  if (result.length <= SEED_MAX_CHARS) return result

  // 3. Drop pending work section
  result = removeSection(result, "PENDING WORK:")
  if (result.length <= SEED_MAX_CHARS) return result

  // 4. Trim subagent lastActivity lines
  result = result.replace(/    last: "[^"]{120,}/g, '    last: "..."')
  if (result.length <= SEED_MAX_CHARS) return result

  // 5. Trim board message bodies
  result = result.replace(/\[INFO\] ([^:]+): "[^"]{80,}/g, '[INFO] $1: "..."')
  result = result.replace(/\[RESULT\] ([^:]+): "[^"]{80,}/g, '[RESULT] $1: "..."')
  result = result.replace(/\[HOLD\] ([^:]+): "[^"]{80,}/g, '[HOLD] $1: "..."')
  result = result.replace(/\[ASK\] ([^:]+): "[^"]{80,}/g, '[ASK] $1: "..."')
  result = result.replace(/\[VETO\] ([^:]+): "[^"]{80,}/g, '[VETO] $1: "..."')
  if (result.length <= SEED_MAX_CHARS) return result

  // 6. Absolute last resort — hard truncate with marker
  const marker = "\n[SEED TRUNCATED — context incomplete]"
  const safeLen = SEED_MAX_CHARS - marker.length
  return result.slice(0, Math.max(0, safeLen)) + marker
}

/**
 * Remove a section from the seed text, identified by its header keyword.
 * Removes from the header line through the next section header or end of text.
 */
function removeSection(text: string, headerKeyword: string): string {
  const lines = text.split("\n")
  const result: string[] = []
  let skipping = false

  const sectionHeaders = ["SUBAGENTS:", "BOARD:", "PENDING WORK:", "FILES CHANGED", "SERVICES:"]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!skipping) {
      // Match: exact keyword, keyword followed by colon, or keyword followed by "(...):"
      if (
        trimmed === headerKeyword ||
        trimmed.startsWith(headerKeyword + ":") ||
        trimmed.match(new RegExp(`^${headerKeyword}\\s+\\([^)]*\\):`))
      ) {
        skipping = true
        continue
      }
      result.push(line)
    } else {
      if (trimmed === "" && i + 1 < lines.length) {
        const nextNonBlank = lines.slice(i + 1).find((l: string) => l.trim() !== "")
        if (nextNonBlank && sectionHeaders.some((h: string) => nextNonBlank.trim().startsWith(h))) {
          result.push(line)
          skipping = false
        }
        // else still inside removed section — skip
      } else if (trimmed !== "") {
        if (sectionHeaders.some((h: string) => trimmed.startsWith(h))) {
          result.push(line)
          skipping = false
        }
        // else skip
      }
    }
  }

  return result.join("\n")
}
