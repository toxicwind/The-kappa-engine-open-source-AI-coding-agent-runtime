import { describe, it, expect } from "bun:test"
import { resumeHint } from "../../src/kappacode/task-resume"

describe("resumeHint", () => {
  it("returns base hint without seed", () => {
    const hint = resumeHint("session-123")
    expect(hint).toContain('task_id="session-123"')
    expect(hint).not.toContain("[RECOVERY CONTEXT]")
  })

  it("includes seed data when seedSnapshot is provided", () => {
    const seed: import("../../src/kappacode/orchestrator-seed").SeedSnapshot = {
      v: 1,
      ts: Date.now(),
      task: { id: "t1", goalBrief: "test", subagentCounts: { running: 1, pending: 0, completed: 0, failed: 1 } },
      subagents: [
        { id: "sa-1", task_id: "t1", status: "failed", model: "x", provider: "k", lastActivity: null, idleMs: null },
      ],
      board: { totalMessages: 1, recentMessages: [{ from: "self", type: "INFO", body: "error", ts: Date.now() }] },
      pendingWork: [],
      fileChanges: { modified: ["a.ts"], added: [], deleted: [], gitAvailable: true },
      services: [],
    }

    const hint = resumeHint("session-123", seed)
    expect(hint).toContain('task_id="session-123"')
    expect(hint).toContain("[RECOVERY CONTEXT")
    expect(hint).toContain("[END RECOVERY CONTEXT]")
    expect(hint).toContain("1 failed")
  })

  it("handles null seedSnapshot gracefully", () => {
    const hint = resumeHint("session-123", null)
    expect(hint).toContain('task_id="session-123"')
    expect(hint).not.toContain("[RECOVERY CONTEXT]")
  })
})
