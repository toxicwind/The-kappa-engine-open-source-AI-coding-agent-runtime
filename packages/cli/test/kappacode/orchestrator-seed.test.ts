import { describe, it, expect } from "bun:test"
import {
  generateSeed,
  formatSeed,
  enforceBudget,
  buildResumeHint,
  SEED_VERSION,
  SEED_MAX_CHARS,
} from "../../src/kappacode/orchestrator-seed"

// ── generateSeed ────────────────────────────────────────────────────────────

describe("generateSeed", () => {
  it("produces a valid SeedSnapshot from minimal input", () => {
    const seed = generateSeed({
      taskId: "test-1",
      goalBrief: "test brief",
      subagents: [
        {
          id: "sa-1",
          task_id: "t1",
          status: "running",
          model: "test",
          provider: "kappa",
          lastActivity: "hello",
          idleMs: 1000,
        },
      ],
      boardMessages: [
        {
          from: "self",
          type: "INFO",
          body: "test msg",
          ts: Date.now(),
        },
      ],
      pendingWork: [{ description: "do stuff", priority: "high" }],
      fileChanges: {
        modified: ["a.ts"],
        added: [],
        deleted: [],
        gitAvailable: true,
      },
      services: [
        {
          name: "test-svc",
          port: 25000,
          status: "up",
          note: null,
        },
      ],
    })

    expect(seed.v).toBe(SEED_VERSION)
    expect(typeof seed.ts).toBe("number")
    expect(seed.task.id).toBe("test-1")
    expect(seed.task.goalBrief).toBe("test brief")
    expect(seed.subagents.length).toBe(1)
    expect(seed.subagents[0].id).toBe("sa-1")
    expect(seed.board.totalMessages).toBe(1)
    expect(seed.task.subagentCounts).toEqual({
      running: 1,
      pending: 0,
      completed: 0,
      failed: 0,
    })
  })

  it("sorts subagents by priority (failed > running > pending)", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: [
        { id: "a", task_id: "t1", status: "pending", model: "x", provider: "kappa", lastActivity: null, idleMs: null },
        { id: "b", task_id: "t1", status: "running", model: "y", provider: "kappa", lastActivity: "hi", idleMs: 5000 },
        { id: "c", task_id: "t1", status: "failed", model: "z", provider: "kappa", lastActivity: "err", idleMs: 30000 },
      ],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    expect(seed.subagents[0].id).toBe("c") // failed first
    expect(seed.subagents[1].id).toBe("b") // running second
    expect(seed.subagents[2].id).toBe("a") // pending last
  })

  it("truncates arrays to configured maximums", () => {
    const longSubagents = Array.from({ length: 20 }, (_, i) => ({
      id: `sa-${i}`,
      task_id: "t1",
      status: "running",
      model: "x",
      provider: "kappa",
      lastActivity: null,
      idleMs: null,
    }))
    const longMessages = Array.from({ length: 50 }, (_, i) => ({
      from: `user-${i}`,
      type: "INFO",
      body: `message ${i}`,
      ts: Date.now(),
    }))
    const longWork = Array.from({ length: 10 }, (_, i) => ({
      description: `work ${i}`,
      priority: "high" as const,
    }))

    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: longSubagents,
      boardMessages: longMessages,
      pendingWork: longWork,
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    expect(seed.subagents.length).toBeLessThanOrEqual(5)
    expect(seed.board.recentMessages.length).toBeLessThanOrEqual(5)
    expect(seed.pendingWork.length).toBeLessThanOrEqual(3)
  })

  it("caps string lengths (goalBrief, board body)", () => {
    const longBrief = "A".repeat(500)
    const longBody = "B".repeat(500)

    const seed = generateSeed({
      taskId: "t1",
      goalBrief: longBrief,
      subagents: [],
      boardMessages: [{ from: "x", type: "INFO", body: longBody, ts: Date.now() }],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    expect(seed.task.goalBrief.length).toBeLessThanOrEqual(120)
    expect(seed.board.recentMessages[0].body.length).toBeLessThanOrEqual(120)
  })

  it("handles empty input", () => {
    const seed = generateSeed({
      taskId: "",
      goalBrief: "",
      subagents: [],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    expect(seed.v).toBe(SEED_VERSION)
    expect(seed.subagents.length).toBe(0)
    expect(seed.board.totalMessages).toBe(0)
    expect(seed.task.subagentCounts).toEqual({ running: 0, pending: 0, completed: 0, failed: 0 })
  })

  it("counts statuses from subagent list", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: [
        { id: "a", task_id: "t1", status: "running", model: "x", provider: "kappa", lastActivity: null, idleMs: null },
        { id: "b", task_id: "t1", status: "running", model: "y", provider: "kappa", lastActivity: null, idleMs: null },
        { id: "c", task_id: "t1", status: "failed", model: "z", provider: "kappa", lastActivity: null, idleMs: null },
        {
          id: "d",
          task_id: "t1",
          status: "completed",
          model: "w",
          provider: "kappa",
          lastActivity: null,
          idleMs: null,
        },
      ],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    expect(seed.task.subagentCounts).toEqual({
      running: 2,
      pending: 0,
      completed: 1,
      failed: 1,
    })
  })
})

// ── formatSeed ──────────────────────────────────────────────────────────────

describe("formatSeed", () => {
  it("produces a valid seed text with required sections", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "test goal",
      subagents: [
        {
          id: "a1",
          task_id: "t1",
          status: "running",
          model: "qwen",
          provider: "kappa",
          lastActivity: "working on it",
          idleMs: 1000,
        },
      ],
      boardMessages: [{ from: "self", type: "INFO", body: "hello", ts: Date.now() }],
      pendingWork: [{ description: "do thing", priority: "high" }],
      fileChanges: { modified: ["a.ts"], added: [], deleted: [], gitAvailable: true },
      services: [{ name: "beellama", port: 25010, status: "up", note: null }],
    })

    const text = formatSeed(seed)
    expect(text).toContain("## SEED [v=")
    expect(text).toContain("TASK: t1")
    expect(text).toContain("SUBAGENTS:")
    expect(text).toContain("BOARD")
    expect(text).toContain("PENDING WORK:")
    expect(text).toContain("FILES CHANGED")
    expect(text).toContain("SERVICES:")
    expect(text).toContain("a1")
  })

  it("output is within SEED_MAX_CHARS budget", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "A realistic goal description that is moderately long to test truncation behavior",
      subagents: [
        {
          id: "a1",
          task_id: "t1",
          status: "running",
          model: "qwen",
          provider: "kappa",
          lastActivity: "working on it",
          idleMs: 1000,
        },
        {
          id: "a2",
          task_id: "t1",
          status: "running",
          model: "opus",
          provider: "kappa",
          lastActivity: "also working",
          idleMs: 2000,
        },
        {
          id: "a3",
          task_id: "t1",
          status: "failed",
          model: "claude",
          provider: "kappa",
          lastActivity: "error",
          idleMs: 30000,
        },
        {
          id: "a4",
          task_id: "t1",
          status: "pending",
          model: "sonnet",
          provider: "kappa",
          lastActivity: null,
          idleMs: null,
        },
        {
          id: "a5",
          task_id: "t1",
          status: "completed",
          model: "haiku",
          provider: "kappa",
          lastActivity: null,
          idleMs: null,
        },
      ],
      boardMessages: [
        { from: "self", type: "INFO", body: "seed generation complete", ts: Date.now() },
        { from: "coordinator", type: "INFO", body: "proceeding to injection phase", ts: Date.now() },
        { from: "worker", type: "RESULT", body: "seed format approved", ts: Date.now() },
        { from: "worker2", type: "HOLD", body: "blocking on seed format", ts: Date.now() },
        { from: "worker3", type: "ASK", body: "need access to board API?", ts: Date.now() },
      ],
      pendingWork: [
        { description: "Finalize seed format", priority: "high" },
        { description: "Implement prompt injection", priority: "high" },
        { description: "Add seed-aware resume hint", priority: "medium" },
      ],
      fileChanges: { modified: ["a.ts", "b.ts", "c.ts"], added: ["d.ts"], deleted: [], gitAvailable: true },
      services: [
        { name: "beellama", port: 25010, status: "up", note: "model: Qwen2.5-32B" },
        { name: "nativelink", port: 25100, status: "up", note: null },
      ],
    })

    const text = formatSeed(seed)
    expect(text.length).toBeLessThanOrEqual(SEED_MAX_CHARS)
  })

  it("handles empty snapshot", () => {
    const seed = generateSeed({
      taskId: "",
      goalBrief: "",
      subagents: [],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [],
    })

    const text = formatSeed(seed)
    expect(text).toContain("## SEED [v=")
    expect(text.length).toBeLessThanOrEqual(SEED_MAX_CHARS)
  })
})

// ── enforceBudget ───────────────────────────────────────────────────────────

describe("enforceBudget", () => {
  it("returns text unchanged when under budget", () => {
    const text = "short text"
    expect(enforceBudget(text)).toBe(text)
  })

  it("trims sections from most to least important", () => {
    // Create a text that exceeds budget
    const services = Array.from(
      { length: 50 },
      (_, i) => `  svc-${i} :80 up with a very long note field that pushes the text well over the budget limit`,
    ).join("\n")
    const text = `## SEED [v=1]\n\nSERVICES:\n${services}\n`
    expect(text.length).toBeGreaterThan(SEED_MAX_CHARS)

    const result = enforceBudget(text)
    expect(result.length).toBeLessThanOrEqual(SEED_MAX_CHARS)
    // Services section should be removed first
    expect(result).not.toContain("  svc-49")
  })

  it("removes file changes section when budget exceeded", () => {
    const files = Array.from(
      { length: 20 },
      (_, i) =>
        `    M some/deeply/nested/monorepo/packages/cli/src/kappacode/modules/file-${i}.ts that pushes past the budget limit significantly`,
    ).join("\n")
    const text = `## SEED [v=1]\n\nFILES CHANGED (git: yes):\n${files}\n\nSERVICES:\n  svc-0 :80 up\n`
    expect(text.length).toBeGreaterThan(SEED_MAX_CHARS)

    const result = enforceBudget(text)
    expect(result.length).toBeLessThanOrEqual(SEED_MAX_CHARS)
    // File changes header should be removed (but file paths still exist in other contexts)
    expect(result).not.toContain("FILES CHANGED")
    // File changes removed first after services (which aren't in this text, so file changes should go)
  })

  it("hard-caps with truncation marker as last resort", () => {
    const text = "A".repeat(SEED_MAX_CHARS + 1000)
    const result = enforceBudget(text)
    expect(result.length).toBeLessThanOrEqual(SEED_MAX_CHARS)
    expect(result).toContain("[SEED TRUNCATED")
  })
})

// ── buildResumeHint ─────────────────────────────────────────────────────────

describe("buildResumeHint", () => {
  it("includes seed version and subagent counts", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: [
        { id: "a", task_id: "t1", status: "failed", model: "x", provider: "k", lastActivity: null, idleMs: null },
        { id: "b", task_id: "t1", status: "running", model: "y", provider: "k", lastActivity: null, idleMs: null },
      ],
      boardMessages: [{ from: "self", type: "INFO", body: "error occurred", ts: Date.now() }],
      pendingWork: [{ description: "retry", priority: "high" }],
      fileChanges: { modified: ["a.ts"], added: [], deleted: [], gitAvailable: true },
      services: [],
    })

    const hint = buildResumeHint(seed, "task failed: connection reset")
    expect(hint).toContain("seed v=1")
    expect(hint).toContain("1 failed")
    expect(hint).toContain("1 running")
    expect(hint).toContain("[RECOVERY CONTEXT")
    expect(hint).toContain("[END RECOVERY CONTEXT]")
  })

  it("includes file changes when present", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: [],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: ["a.ts", "b.ts"], added: [], deleted: [], gitAvailable: true },
      services: [],
    })

    const hint = buildResumeHint(seed, "task failed")
    expect(hint).toContain("a.ts")
  })

  it("does not include services section (budget priority)", () => {
    const seed = generateSeed({
      taskId: "t1",
      goalBrief: "brief",
      subagents: [],
      boardMessages: [],
      pendingWork: [],
      fileChanges: { modified: [], added: [], deleted: [], gitAvailable: false },
      services: [{ name: "beellama", port: 25010, status: "up", note: null }],
    })

    const hint = buildResumeHint(seed, "task failed")
    expect(hint).not.toContain("beellama")
  })
})
