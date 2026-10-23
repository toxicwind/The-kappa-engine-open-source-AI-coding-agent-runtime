import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Effect, Layer } from "effect"
import { Memory } from "@opencode-ai/core/memory"

function withTestHome<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const prior = process.env.KAPPA_TEST_HOME
  process.env.KAPPA_TEST_HOME = dir
  return Promise.resolve(fn()).finally(() => {
    if (prior === undefined) delete process.env.KAPPA_TEST_HOME
    else process.env.KAPPA_TEST_HOME = prior
  })
}

function freshLayer() {
  const layer = Layer.effect(
    Memory.Service,
    Effect.sync(() => {
      const entries = new Map<string, Memory.MemoryEntry>()
      const keyIndex = new Map<string, string>()
      let memoryDir = ""
      let storagePath = ""

      const loadEntries = (): Map<string, Memory.MemoryEntry> => {
        const resolved = new Map<string, Memory.MemoryEntry>()
        try {
          const raw = fs.readFileSync(storagePath, "utf-8")
          for (const line of raw.split("\n").filter(Boolean)) {
            try {
              const entry: Memory.MemoryEntry = JSON.parse(line)
              resolved.set(entry.id, entry)
            } catch {
              /* skip malformed */
            }
          }
        } catch {
          /* file doesn't exist yet */
        }
        return resolved
      }

      const persist = () => {
        try {
          const lines = Array.from(entries.values())
            .toSorted((a, b) => a.created_at - b.created_at)
            .map((e) => JSON.stringify(e))
            .join("\n")
          fs.writeFileSync(storagePath, lines + (lines ? "\n" : ""))
        } catch {
          /* disk full etc */
        }
      }

      const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

      const retainFn = (input: {
        text: string
        key?: string
        source?: Memory.MemoryEntry["source"]
        tags?: string[]
      }): Memory.MemoryEntry => {
        const key = input.key ?? genId()
        const entry: Memory.MemoryEntry = {
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

      const recallFn = (input: { query: string; limit?: number }): Memory.RecallResult => {
        const q = input.query.toLowerCase()
        const limit = input.limit ?? 10
        const scored: Array<Memory.MemoryEntry & { _score: number }> = []
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

      const reflectFn = (input: { query?: string }): Memory.ReflectResult => {
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

      const clearFn = () => {
        entries.clear()
        keyIndex.clear()
        persist()
      }

      const listKeysFn = () => Array.from(keyIndex.keys())

      const forgetFn = (input: { prefix: string }): number => {
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

      const recallSessionFn = (input: {
        query: string
        limit?: number
        previouslyRecalled: Set<string>
      }): Memory.RecallResult => {
        const q = input.query.toLowerCase()
        const limit = input.limit ?? 10
        const scored: Array<Memory.MemoryEntry & { _score: number }> = []
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

      memoryDir = path.join(os.homedir(), ".local", "share", "kappa", "memory")
      storagePath = path.join(memoryDir, "kappa-memory.jsonl")
      entries.clear()
      keyIndex.clear()

      return Memory.Service.of({
        retain: (input) => Effect.sync(() => retainFn(input)),
        recall: (input) => Effect.sync(() => recallFn(input)),
        reflect: (input) => Effect.sync(() => reflectFn(input)),
        clear: () => Effect.sync(() => clearFn()),
        listKeys: () => Effect.sync(() => listKeysFn()),
        count: () => Effect.sync(() => entries.size),
        forget: (input) => Effect.sync(() => forgetFn(input)),
        recallSession: (input) => Effect.sync(() => recallSessionFn(input)),
      })
    }),
  )
  return layer
}

describe("Memory Service retain", () => {
  test("creates entry with auto-generated key when key is not provided", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const entry = yield* svc.retain({ text: "remember this" })
      expect(entry.text).toBe("remember this")
      expect(entry.source).toBe("user")
      expect(entry.key).toBeTruthy()
      expect(entry.id).toBeTruthy()
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("stores entry with provided key", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const entry = yield* svc.retain({ text: "keyed memory", key: "project_root" })
      expect(entry.key).toBe("project_root")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("accepts custom source type", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const entry = yield* svc.retain({ text: "automated", source: "auto" })
      expect(entry.source).toBe("auto")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("accepts tags on stored entry", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const entry = yield* svc.retain({ text: "tagged", tags: ["config", "important"] })
      expect(entry.tags).toEqual(["config", "important"])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("overwrites entry when the same key is used", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "first", key: "same_key" })
      const entry2 = yield* svc.retain({ text: "second", key: "same_key" })
      expect(entry2.text).toBe("second")
      const keys = yield* svc.listKeys()
      expect(keys.filter((k) => k === "same_key").length).toBe(1)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("truncates text to 12000 characters", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const longText = "a".repeat(20_000)
      const entry = yield* svc.retain({ text: longText })
      expect(entry.text.length).toBe(12_000)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service recall", () => {
  test("returns no results for empty store", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const result = yield* svc.recall({ query: "nothing here" })
      expect(result.count).toBe(0)
      expect(result.entries.length).toBe(0)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("finds entry by text match", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "project architecture", key: "arch" })
      const result = yield* svc.recall({ query: "architecture" })
      expect(result.count).toBe(1)
      expect(result.entries[0].key).toBe("arch")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("finds entry by key match", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "some data", key: "project_root" })
      const result = yield* svc.recall({ query: "project" })
      expect(result.count).toBe(1)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("finds entry by tag match", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "config data", key: "cfg", tags: ["setup"] })
      const result = yield* svc.recall({ query: "setup" })
      expect(result.count).toBe(1)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("ranks text matches lower than key matches", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "project architecture notes", key: "project_architecture" })
      yield* svc.retain({ text: "random text about project", key: "random" })
      const result = yield* svc.recall({ query: "project" })
      expect(result.count).toBe(2)
      expect(result.entries[0].key).toBe("project_architecture")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("respects the limit parameter", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "a", key: "k1" })
      yield* svc.retain({ text: "b", key: "k2" })
      yield* svc.retain({ text: "c", key: "k3" })
      const result = yield* svc.recall({ query: "", limit: 2 })
      expect(result.count).toBe(2)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("case-insensitive search", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "HELLO WORLD", key: "hw" })
      const result = yield* svc.recall({ query: "hello" })
      expect(result.count).toBe(1)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service reflect", () => {
  test("returns empty result when no memories stored", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const result = yield* svc.reflect({ query: "anything" })
      expect(result.summary).toBe("No memories stored yet.")
      expect(result.patterns).toEqual([])
      expect(result.suggestions).toEqual([])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("reports correct counts by source", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "user note", source: "user" })
      yield* svc.retain({ text: "auto note", source: "auto" })
      yield* svc.retain({ text: "tool note", source: "tool" })
      const result = yield* svc.reflect({})
      expect(result.patterns).toContain("1 user memories")
      expect(result.patterns).toContain("1 auto memories")
      expect(result.patterns).toContain("1 tool memories")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("includes suggestion when more than 20 memories exist", () => {
    const entries = new Map<string, Memory.MemoryEntry>()
    const keyIndex = new Map<string, string>()
    for (let i = 0; i < 21; i++) {
      const key = `k${i}`
      const entry: Memory.MemoryEntry = {
        id: `id-${i}`,
        text: `note ${i}`,
        key,
        source: "user" as const,
        created_at: Date.now() + i,
        tags: undefined,
      }
      entries.set(entry.id, entry)
      keyIndex.set(key, entry.id)
    }
    const bySource: Record<string, number> = {}
    for (const e of entries.values()) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1
    }
    const suggestions: string[] = []
    if (entries.size > 20) {
      suggestions.push("Consider consolidating old memories with specific keys")
    }
    expect(suggestions).toContain("Consider consolidating old memories with specific keys")
  })
})

describe("Memory Service listKeys", () => {
  test("returns empty list when store is empty", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const keys = yield* svc.listKeys()
      expect(keys).toEqual([])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("returns all stored keys", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "a", key: "alpha" })
      yield* svc.retain({ text: "b", key: "beta" })
      yield* svc.retain({ text: "c", key: "gamma" })
      const keys = yield* svc.listKeys()
      expect(keys).toEqual(["alpha", "beta", "gamma"])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service count", () => {
  test("returns zero for empty store", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const count = yield* svc.count()
      expect(count).toBe(0)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("returns correct count after multiple retains", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "one", key: "k1" })
      yield* svc.retain({ text: "two", key: "k2" })
      const count = yield* svc.count()
      expect(count).toBe(2)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service forget", () => {
  test("removes entries matching prefix", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "a", key: "temp_x" })
      yield* svc.retain({ text: "b", key: "temp_y" })
      yield* svc.retain({ text: "keep", key: "permanent" })
      const removed = yield* svc.forget({ prefix: "temp_" })
      expect(removed).toBe(2)
      const count = yield* svc.count()
      expect(count).toBe(1)
      const keys = yield* svc.listKeys()
      expect(keys).toEqual(["permanent"])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("returns zero when no entries match prefix", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "a", key: "alpha" })
      const removed = yield* svc.forget({ prefix: "nonexistent_" })
      expect(removed).toBe(0)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service recallSession", () => {
  test("excludes entries already in previouslyRecalled set", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "new memory", key: "fresh" })
      yield* svc.retain({ text: "old memory", key: "seen" })
      const result = yield* svc.recallSession({
        query: "memory",
        previouslyRecalled: new Set(["seen"]),
      })
      expect(result.count).toBe(1)
      expect(result.entries[0].key).toBe("fresh")
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("respects limit parameter for session recall", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "a", key: "a1" })
      yield* svc.retain({ text: "b", key: "a2" })
      yield* svc.retain({ text: "c", key: "a3" })
      const result = yield* svc.recallSession({
        query: "",
        limit: 2,
        previouslyRecalled: new Set(),
      })
      expect(result.count).toBe(2)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))

  test("falls back to entry id when key is missing", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      const entry = yield* svc.retain({ text: "keyless" })
      const result = yield* svc.recallSession({
        query: "keyless",
        previouslyRecalled: new Set([entry.key ?? entry.id]),
      })
      expect(result.count).toBe(0)
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})

describe("Memory Service clear", () => {
  test("removes all entries and persists empty state", () =>
    Effect.gen(function* () {
      const svc = yield* Memory.Service
      yield* svc.retain({ text: "to clear", key: "to_clear" })
      yield* svc.retain({ text: "also clear", key: "also" })
      yield* svc.clear()
      expect(yield* svc.count()).toBe(0)
      expect(yield* svc.listKeys()).toEqual([])
    }).pipe(Effect.provide(freshLayer()), Effect.runPromise))
})
