import { Context, Effect, Layer } from "effect"
import { makeGlobalNode, tags } from "../effect/app-node"

/**
 * Minimal, first-class memory service built into kappa-code core.
 *
 * This is the integrated memory primitive — NOT a separate delivery package.
 * It mirrors tau's hindsight integration pattern: session-scoped state,
 * built-in Effect service with node-based wiring, and canonical tools
 * registered alongside bash/edit/read as core capabilities.
 *
 * Storage uses JSONL files on disk so recall/retain survive restarts
 * without requiring a separate database.
 *
 * Interface: retain (write), recall (search), reflect (stub).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type MemoryEntry = {
  id: string
  text: string
  key?: string
  source: "user" | "auto" | "tool"
  created_at: number
  session_id?: string
  tags?: string[]
}

export type RecallResult = {
  entries: MemoryEntry[]
  query: string
  count: number
}

export type ReflectResult = {
  summary: string
  patterns: string[]
  suggestions: string[]
}

// ── Session-scoped state (Phase 2) ─────────────────────────────────────────

/** Per-session tracking for auto-recall / auto-retain. Mirrors tau's
 * HindsightSessionState shape: what was recalled/retained this session,
 * when, and whether auto-recall already fired. */
// kilocode_change - Phase 2: session-scoped state (B1, B5)
// kilocode_change start
export interface SessionMemoryState {
  readonly sessionID: string
  readonly recalled: Set<string>
  readonly retained: Set<string>
  readonly lastRecallAt: number
  readonly lastRetainAt: number
}

export interface MentalModels {
  readonly get: (key: string) => string | undefined
  readonly set: (key: string, value: string) => void
  readonly keys: () => string[]
  readonly clear: () => void
}
// kilocode_change end

// kilocode_change - Phase 2: extended interface (forget, recallSession)

// ── Service Interface (extended Phase 2) ───────────────────────────────────

export interface Interface {
  readonly retain: (input: {
    text: string
    key?: string
    source?: MemoryEntry["source"]
    tags?: string[]
  }) => Effect.Effect<MemoryEntry>

  readonly recall: (input: { query: string; limit?: number }) => Effect.Effect<RecallResult>

  readonly reflect: (input: { query?: string }) => Effect.Effect<ReflectResult>

  readonly clear: () => Effect.Effect<void>

  readonly listKeys: () => Effect.Effect<string[]>

  readonly count: () => Effect.Effect<number>

  /** Forget entries whose key starts with prefix (used for auto-retain compaction). */
  readonly forget: (input: { prefix: string }) => Effect.Effect<number> // kilocode_change - Phase 2

  /** Session-scoped auto-recall: inject entries whose key matches the query
   * and that were NOT previously recalled this session. Returns only the new hits. */
  readonly recallSession: (input: {
    query: string
    limit?: number
    previouslyRecalled: Set<string>
  }) => Effect.Effect<RecallResult> // kilocode_change - Phase 2
}

// ── Context Service ────────────────────────────────────────────────────────

export class Service extends Context.Service<Service, Interface>()("@kappacode/Memory") {}

// ── Implementation ─────────────────────────────────────────────────────────

// kilocode_change - new file — Phase 2 session-scoped memory state
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const STORAGE_FILE = "kappa-memory.jsonl"

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadEntries(): Map<string, MemoryEntry> {
  const entries = new Map<string, MemoryEntry>()
  const memoryDir = path.join(os.homedir(), ".local", "share", "kappa", "memory")
  const storagePath = path.join(memoryDir, STORAGE_FILE)
  try {
    fs.mkdirSync(memoryDir, { recursive: true })
  } catch {
    // non-fatal
  }
  try {
    const raw = fs.readFileSync(storagePath, "utf-8")
    for (const line of raw.split("\n").filter(Boolean)) {
      try {
        const entry: MemoryEntry = JSON.parse(line)
        entries.set(entry.id, entry)
      } catch {
        // corrupt line
      }
    }
  } catch {
    // no file yet
  }
  return entries
}

function make() {
  const entries = loadEntries()
  const keyIndex = new Map<string, string>()

  // Build key index from loaded entries
  for (const entry of entries.values()) {
    if (entry.key) keyIndex.set(entry.key, entry.id)
  }

  const memoryDir = path.join(os.homedir(), ".local", "share", "kappa", "memory")
  const storagePath = path.join(memoryDir, STORAGE_FILE)

  function persist(): void {
    try {
      const lines = Array.from(entries.values())
        .toSorted((a, b) => a.created_at - b.created_at)
        .map((e) => JSON.stringify(e))
        .join("\n")
      fs.writeFileSync(storagePath, lines + (lines ? "\n" : ""))
    } catch {
      // fire-and-forget
    }
  }

  function retainFn(input: {
    text: string
    key?: string
    source?: MemoryEntry["source"]
    tags?: string[]
  }): MemoryEntry {
    const key = input.key ?? genId()
    const entry: MemoryEntry = {
      id: genId(),
      text: input.text.slice(0, 12_000),
      key,
      source: input.source ?? "user",
      created_at: Date.now(),
      tags: input.tags,
    }
    const existingId = keyIndex.get(key)
    if (existingId) entries.delete(existingId)
    entries.set(entry.id, entry)
    keyIndex.set(key, entry.id)
    persist()
    return entry
  }

  function recallFn(input: { query: string; limit?: number }): RecallResult {
    const q = input.query.toLowerCase()
    const limit = input.limit ?? 10
    const scored: Array<MemoryEntry & { _score: number }> = []
    for (const entry of entries.values()) {
      const textLower = entry.text.toLowerCase()
      const keyLower = entry.key?.toLowerCase() ?? ""
      const tagMatch = entry.tags?.some((t) => t.toLowerCase().includes(q)) ?? false
      const keyMatch = keyLower.includes(q)
      const textMatch = textLower.includes(q)
      const score = (textMatch ? 2 : 0) + (keyMatch ? 3 : 0) + (tagMatch ? 1 : 0)
      if (score > 0) scored.push({ ...entry, _score: score })
    }
    scored.sort((a, b) => b._score - a._score)
    const ranked = scored.slice(0, limit)
    return {
      entries: ranked.map(({ _score: _, ...e }) => e),
      query: input.query,
      count: ranked.length,
    }
  }

  function reflectFn(input: { query?: string }): ReflectResult {
    const allEntries = Array.from(entries.values())
    if (allEntries.length === 0) {
      return { summary: "No memories stored yet.", patterns: [], suggestions: [] }
    }
    const bySource: Record<string, number> = {}
    for (const e of allEntries) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1
    }
    const patterns = Object.entries(bySource)
      .map(([src, count]) => `${count} ${src} memories`)
      .filter(Boolean)
    const suggestions: string[] = []
    if (allEntries.length > 20) {
      suggestions.push("Consider consolidating old memories with specific keys")
    }
    return {
      summary: `You have ${allEntries.length} memor${allEntries.length === 1 ? "y" : "ies"} across ${Object.keys(bySource).join(", ") || "unknown"}.`,
      patterns,
      suggestions,
    }
  }

  function clearFn(): void {
    entries.clear()
    keyIndex.clear()
    persist()
  }

  function listKeysFn(): string[] {
    return Array.from(keyIndex.keys())
  }

  // kilocode_change start - Phase 2: forget by key prefix
  function forgetFn(input: { prefix: string }): number {
    let removed = 0
    for (const [k, id] of keyIndex.entries()) {
      if (k.startsWith(input.prefix)) {
        keyIndex.delete(k)
        entries.delete(id)
        removed++
      }
    }
    if (removed > 0) persist()
    return removed
  }

  // kilocode_change start - Phase 2: session-scoped auto-recall
  function recallSessionFn(input: { query: string; limit?: number; previouslyRecalled: Set<string> }): RecallResult {
    const q = input.query.toLowerCase()
    const limit = input.limit ?? 10
    const scored: Array<MemoryEntry & { _score: number }> = []
    for (const entry of entries.values()) {
      if (input.previouslyRecalled.has(entry.key ?? entry.id)) continue
      const textLower = entry.text.toLowerCase()
      const keyLower = entry.key?.toLowerCase() ?? ""
      const tagMatch = entry.tags?.some((t) => t.toLowerCase().includes(q)) ?? false
      const keyMatch = keyLower.includes(q)
      const textMatch = textLower.includes(q)
      const score = (textMatch ? 2 : 0) + (keyMatch ? 3 : 0) + (tagMatch ? 1 : 0)
      if (score > 0) scored.push({ ...entry, _score: score })
    }
    scored.sort((a, b) => b._score - a._score)
    const ranked = scored.slice(0, limit)
    return {
      entries: ranked.map(({ _score: _, ...e }) => e),
      query: input.query,
      count: ranked.length,
    }
  }
  // kilocode_change end
  // kilocode_change end

  return Service.of({
    retain: (input) => Effect.sync(() => retainFn(input)),
    recall: (input) => Effect.sync(() => recallFn(input)),
    reflect: (input) => Effect.sync(() => reflectFn(input)),
    clear: () => Effect.sync(() => clearFn()),
    listKeys: () => Effect.sync(() => listKeysFn()),
    count: () => Effect.sync(() => entries.size),
    forget: (input) => Effect.sync(() => forgetFn(input)), // kilocode_change - Phase 2
    recallSession: (input) => Effect.sync(() => recallSessionFn(input)), // kilocode_change - Phase 2
  })
}

const layer = Layer.effect(Service, Effect.sync(make))

export const node = makeGlobalNode({ service: Service, layer, deps: [] as const })

// kilocode_change start - Phase 2: session-scoped memory tracker (B1)

/** Tracks per-session what was recalled / retained so auto-recall skips
 * entries already seen this session.  Reset on session start; persisted
 * across turns within the same session. */
export class SessionMemory implements SessionMemoryState {
  readonly recalled = new Set<string>()
  readonly retained = new Set<string>()
  readonly lastRecallAt = 0
  readonly lastRetainAt = 0

  constructor(readonly sessionID: string) {}

  markRecalled(key: string): void {
    this.recalled.add(key)
  }

  markRetained(key: string): void {
    this.retained.add(key)
  }

  wasRecalled(key: string): boolean {
    return this.recalled.has(key)
  }

  reset(): void {
    this.recalled.clear()
    this.retained.clear()
  }
}
// kilocode_change end

// kilocode_change start - Phase 2: mental models store (B5)

/** In-memory store of agent mental models for the current session.
 * Keys are stable identifiers (e.g. "project_architecture"), values are short text. */
export class MentalModelStore implements MentalModels {
  private readonly store = new Map<string, string>()

  get(key: string): string | undefined {
    return this.store.get(key)
  }

  set(key: string, value: string): void {
    this.store.set(key, value.slice(0, 2_000))
  }

  keys(): string[] {
    return Array.from(this.store.keys())
  }

  clear(): void {
    this.store.clear()
  }
}
// kilocode_change end

// kilocode_change - Phase 2: value namespace with expanded types

export const Memory = { Service, node } as const // kilocode_change - Phase 2

declare global {
  namespace Memory {
    // kilocode_change start
    export type { MemoryEntry, RecallResult, ReflectResult, Interface, SessionMemoryState, MentalModels }
    // kilocode_change end
  }
}
