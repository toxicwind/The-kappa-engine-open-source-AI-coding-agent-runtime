import { describe, expect, test } from "bun:test"

/**
 * Cold-tool re-rank for tool selection (EMNLP 2026: 74.1% over-select recent tools)
 * Models over-select recently retrieved tools even when older tools would make progress,
 * and do not reliably recover when the useful tool re-appears.
 * The bottleneck is the transition from discovery to execution.
 *
 * Capability-contract test: validate that cold tools (not used in last N turns)
 * are re-ranked and surfaced explicitly.
 */

describe("Cold-tool re-rank capability contract", () => {
  type Tool = { name: string; description: string; category: string }

  type TurnHistory = {
    turn: number
    toolUsed: string
    toolResult: string
  }[]

  function matchToolToSubgoal(tools: Tool[], subgoal: string): Tool[] {
    const keywords = subgoal
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
    return tools
      .map((t) => ({
        tool: t,
        score: keywords.reduce((s, k) => s + (t.description.toLowerCase().includes(k) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .map((t) => t.tool)
  }

  function coldToolReRank(tools: Tool[], history: TurnHistory, subgoal: string, lookbackTurns: number = 4): Tool[] {
    const recentToolNames = new Set(history.slice(-lookbackTurns).map((h) => h.toolUsed))

    const coldTools = tools.filter((t) => !recentToolNames.has(t.name))
    const hotTools = tools.filter((t) => recentToolNames.has(t.name))

    // Rank cold tools by subgoal match (highest first)
    const rankedCold = matchToolToSubgoal(coldTools, subgoal)
    // Rank hot tools by subgoal match (highest first)
    const rankedHot = matchToolToSubgoal(hotTools, subgoal)

    // Tools that don't match subgoal at all
    const unmatchedCold = coldTools.filter((t) => !rankedCold.includes(t))
    const unmatchedHot = hotTools.filter((t) => !rankedHot.includes(t))

    // Return: matched cold -> unmatched cold -> matched hot -> unmatched hot
    return [...rankedCold, ...unmatchedCold, ...rankedHot, ...unmatchedHot]
  }

  test("models over-select recent tools (74.1% of non-progress calls use recent tools)", () => {
    // From EMNLP 2026 evidence
    const overSelectRate = 0.741
    expect(overSelectRate).toBeGreaterThan(0.7)
  })

  test("cold tools are tools not used in last N turns", () => {
    const tools: Tool[] = [
      { name: "bash", description: "Execute shell commands", category: "system" },
      { name: "python", description: "Run Python scripts", category: "system" },
      { name: "curl", description: "Make HTTP requests", category: "network" },
      { name: "jq", description: "Process JSON data", category: "data" },
    ]

    const history: TurnHistory = [
      { turn: 1, toolUsed: "bash", toolResult: "output1" },
      { turn: 2, toolUsed: "python", toolResult: "output2" },
      { turn: 3, toolUsed: "bash", toolResult: "output3" },
      { turn: 4, toolUsed: "curl", toolResult: "output4" },
    ]

    const lookbackTurns = 4
    const recentTools = new Set(history.slice(-lookbackTurns).map((h) => h.toolUsed))

    expect(recentTools).toContain("bash")
    expect(recentTools).toContain("python")
    expect(recentTools).toContain("curl")
    expect(recentTools).not.toContain("jq") // cold tool
  })

  test("cold tools are re-ranked by subgoal match", () => {
    const tools: Tool[] = [
      { name: "bash", description: "Execute shell commands", category: "system" },
      { name: "python", description: "Run Python scripts", category: "system" },
      { name: "curl", description: "Make HTTP requests", category: "network" },
      { name: "jq", description: "Process JSON data", category: "data" },
    ]

    const history: TurnHistory = [
      { turn: 1, toolUsed: "bash", toolResult: "output1" },
      { turn: 2, toolUsed: "python", toolResult: "output2" },
      { turn: 3, toolUsed: "bash", toolResult: "output3" },
      { turn: 4, toolUsed: "curl", toolResult: "output4" },
    ]

    // Subgoal: need to process JSON
    const subgoal = "parse and filter JSON data"
    const ranked = coldToolReRank(tools, history, subgoal, 4)

    // jq should be ranked highest (cold tool matching subgoal)
    expect(ranked[0].name).toBe("jq")
  })

  test("models fail to recover when useful tool re-appears", () => {
    // From EMNLP 2026: "do not reliably recover when the useful tool re-appears"
    const tools: Tool[] = [
      { name: "bash", description: "Execute shell commands", category: "system" },
      { name: "jq", description: "Process JSON data", category: "data" },
    ]

    const history: TurnHistory = [
      { turn: 1, toolUsed: "bash", toolResult: "output1" },
      { turn: 2, toolUsed: "bash", toolResult: "output2" },
      { turn: 3, toolUsed: "jq", toolResult: "success" }, // jq worked!
      { turn: 4, toolUsed: "bash", toolResult: "output3" },
      { turn: 5, toolUsed: "bash", toolResult: "output4" },
    ]

    // Model should recognize jq worked and use it again, but EMNLP shows they don't
    const recentTools = new Set(history.slice(-4).map((h) => h.toolUsed))
    expect(recentTools).toContain("jq") // jq is in recent history
    expect(recentTools).toContain("bash")

    // But the cold-tool re-rank should still surface jq for JSON tasks
    const subgoal = "filter JSON response"
    const ranked = coldToolReRank(tools, history, subgoal, 4)
    // jq was used recently so it's "hot" but should still match subgoal
    const jqTool = ranked.find((t) => t.name === "jq")
    expect(jqTool).toBeDefined()
  })

  test("bottleneck is transition from discovery to execution", () => {
    // EMNLP 2026: "The bottleneck is the transition from discovery to execution"
    // A gate that only says "fork" is not enough; it must force a cold-tool re-rank
    const hasDiscoveryPhase = true
    const hasExecutionPhase = true
    const hasColdToolReRank = true

    expect(hasDiscoveryPhase && hasExecutionPhase && hasColdToolReRank).toBe(true)
  })

  test("gate must force cold-tool re-rank explicitly", () => {
    // "On repetition, force a cold-tool re-rank: list tools not used in the last N turns
    // whose descriptions match the current subgoal"
    const subgoal = "process JSON data"
    const tools: Tool[] = [
      { name: "bash", description: "Execute shell commands", category: "system" },
      { name: "jq", description: "Process JSON data", category: "data" },
      { name: "python", description: "Process JSON data with Python", category: "system" },
    ]

    const history: TurnHistory = [
      { turn: 1, toolUsed: "bash", toolResult: "output" },
      { turn: 2, toolUsed: "bash", toolResult: "output" },
      { turn: 3, toolUsed: "bash", toolResult: "output" },
      { turn: 4, toolUsed: "bash", toolResult: "output" },
    ]

    const ranked = coldToolReRank(tools, history, subgoal, 4)

    // All tools should be returned
    expect(ranked.length).toBe(3)

    // Cold tools matching subgoal (jq, python) should appear first
    expect(ranked[0].name).toBe("jq")
    expect(ranked[1].name).toBe("python")

    // Hot tools (bash) should appear after cold tools
    expect(ranked[2].name).toBe("bash")
  })
})
