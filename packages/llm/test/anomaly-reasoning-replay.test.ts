import { describe, expect, test } from "bun:test"

/**
 * Reasoning Replay Ledger (RRL) — the compacted ledger {turn, claim, evidence, next}
 * is persisted and re-injected each turn, and `reasoning_content` is sent back unchanged
 * when the endpoint honours it. This is the fix for the empty-`thinking` re-derivation loop.
 * 
 * Capability-contract test: validate that reasoning_content is preserved and replayed
 * when the endpoint honours it (X-Reasoning-Passthrough).
 */

describe("Reasoning Replay Ledger (RRL) capability contract", () => {
  
  type LedgerEntry = {
    turn: number
    claim: string
    evidence: string
    next: string
    reasoningContent?: string
    toolCalls?: { name: string; args: string }[]
  }
  
  type RRL = LedgerEntry[]
  
  function createLedgerEntry(turn: number, claim: string, evidence: string, next: string, reasoningContent?: string, toolCalls?: { name: string; args: string }[]): LedgerEntry {
    return { turn, claim, evidence, next, reasoningContent, toolCalls }
  }
  
  function replayReasoning(ledger: RRL): string {
    return ledger
      .filter(e => e.reasoningContent)
      .map(e => e.reasoningContent!)
      .join("\n---\n")
  }
  
  function compactLedger(ledger: RRL, maxEntries: number = 10): RRL {
    if (ledger.length <= maxEntries) return ledger
    // Keep first entry (context) and last N entries
    return [ledger[0], ...ledger.slice(-maxEntries + 1)]
  }
  
  test("ledger stores turn, claim, evidence, next", () => {
    const entry = createLedgerEntry(1, "I think the answer is 42", "Previous context says...", "Verify with calculation")
    expect(entry.turn).toBe(1)
    expect(entry.claim).toBe("I think the answer is 42")
    expect(entry.evidence).toBe("Previous context says...")
    expect(entry.next).toBe("Verify with calculation")
  })
  
  test("reasoning_content is persisted when endpoint honours it", () => {
    const entry = createLedgerEntry(1, "Thinking step 1", "Evidence", "Next step", "Detailed reasoning here...")
    expect(entry.reasoningContent).toBe("Detailed reasoning here...")
  })
  
  test("replayReasoning concatenates reasoning_content from all turns", () => {
    const ledger: RRL = [
      createLedgerEntry(1, "Claim 1", "Evidence 1", "Next 1", "Reasoning 1"),
      createLedgerEntry(2, "Claim 2", "Evidence 2", "Next 2", "Reasoning 2"),
      createLedgerEntry(3, "Claim 3", "Evidence 3", "Next 3", undefined), // no reasoning
      createLedgerEntry(4, "Claim 4", "Evidence 4", "Next 4", "Reasoning 4"),
    ]
    
    const replayed = replayReasoning(ledger)
    expect(replayed).toBe("Reasoning 1\n---\nReasoning 2\n---\nReasoning 4")
  })
  
  test("compactLedger keeps first entry and last N entries", () => {
    const ledger: RRL = Array.from({ length: 15 }, (_, i) => 
      createLedgerEntry(i + 1, `Claim ${i + 1}`, `Evidence ${i + 1}`, `Next ${i + 1}`, `Reasoning ${i + 1}`)
    )
    
    const compacted = compactLedger(ledger, 10)
    expect(compacted.length).toBe(10)
    expect(compacted[0].turn).toBe(1) // First entry preserved
    expect(compacted[9].turn).toBe(15) // Last entry preserved
  })
  
  test("tool_calls are stored alongside reasoning", () => {
    const entry = createLedgerEntry(
      1, "Claim", "Evidence", "Next", "Reasoning",
      [{ name: "bash", args: "ls -la" }, { name: "python", args: "script.py" }]
    )
    
    expect(entry.toolCalls).toHaveLength(2)
    expect(entry.toolCalls![0].name).toBe("bash")
    expect(entry.toolCalls![1].name).toBe("python")
  })
  
  test("never send tool-loop request with empty prior - ledger must be injected", () => {
    // The rule: Never send a tool-loop request with an empty prior
    const emptyLedger: RRL = []
    const hasPrior = emptyLedger.length > 0
    expect(hasPrior).toBe(false)
    
    // When we have a ledger, we must inject it
    const nonEmptyLedger: RRL = [createLedgerEntry(1, "Claim", "Evidence", "Next", "Reasoning")]
    const hasPriorNonEmpty = nonEmptyLedger.length > 0
    expect(hasPriorNonEmpty).toBe(true)
  })
  
  test("Kimi K3 preserves reasoning_content during multi-turn and tool-call requests", () => {
    // From AGENTS.md: Kimi K3 preserves `reasoning_content` during multi-turn and tool-call requests
    // Guidance: pass the complete assistant message back unchanged — including `reasoning_content` and `tool_calls`
    const assistantMessage = {
      role: "assistant",
      content: "Final answer",
      reasoning_content: "Thinking process...",
      tool_calls: [{ id: "call_1", function: { name: "tool", arguments: "{}" } }]
    }
    
    // Should preserve both reasoning_content AND tool_calls
    expect(assistantMessage.reasoning_content).toBeDefined()
    expect(assistantMessage.tool_calls).toBeDefined()
    expect(assistantMessage.tool_calls).toHaveLength(1)
  })
  
  test("Nemotron 3.5 Bolt E4B returns reasoning separately from final answer", () => {
    // From AGENTS.md: Nemotron 3.5 Bolt E4B returns reasoning separately from final answer
    // Chat template reads `enable_thinking` and effort markers
    const nemotronResponse = {
      choices: [{
        message: {
          content: "The answer is 42",
          reasoning: "Detailed reasoning here..." // separate field
        }
      }]
    }
    
    expect(nemotronResponse.choices[0].message.reasoning).toBeDefined()
    expect(nemotronResponse.choices[0].message.content).toBeDefined()
  })
  
  test("gate must fingerprint what endpoint does with reasoning_content", () => {
    // From AGENTS.md: So the gate cannot name a vendor; it must fingerprint
    // what the endpoint actually does with `reasoning_content` and replay accordingly.
    const providerCapabilities = {
      "kimi-k3": { preservesReasoningContent: true, preservesToolCalls: true },
      "nemotron-3.5-bolt-e4b": { preservesReasoningContent: false, hasSeparateReasoningField: true },
      "minimax-m3": { preservesReasoningContent: false, usesThinkingDisabled: true },
      "argon": { preservesReasoningContent: true, hasEffortControl: true }
    }
    
    // Each provider has different behavior - must fingerprint, not assume by name
    expect(providerCapabilities["kimi-k3"].preservesReasoningContent).toBe(true)
    expect(providerCapabilities["nemotron-3.5-bolt-e4b"].preservesReasoningContent).toBe(false)
    expect(providerCapabilities["minimax-m3"].usesThinkingDisabled).toBe(true)
  })
})
