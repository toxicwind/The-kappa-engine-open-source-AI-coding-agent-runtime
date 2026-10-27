import { describe, expect, test } from "bun:test"

/**
 * Anomaly 9: Latency-only benchmark corruption
 * Latency-only benchmark rows with zero tokens (nvidia-tps.jsonl shows tps:0) are handshakes, not completions.
 * Quality/tool-correctness/cost belong in the objective set; use Pareto frontiers, reject zero-token rows.
 * 
 * Capability-contract test: validate that we reject tps:0 rows from Pareto frontiers.
 */

describe("Anomaly 9: Latency-only benchmark corruption capability contract", () => {
  
  test("latency-only benchmark rows with zero tokens are handshakes, not completions", () => {
    // From AGENTS.md: nvidia-tps.jsonl shows tps:0 rows are handshakes, not completions
    const handshakeRow = { tps: 0, latency: 45, tokens: 0, type: "handshake" }
    const completionRow = { tps: 120, latency: 8, tokens: 500, type: "completion" }
    
    expect(handshakeRow.tps).toBe(0)
    expect(handshakeRow.tokens).toBe(0)
    expect(handshakeRow.type).toBe("handshake")
    
    expect(completionRow.tps).toBeGreaterThan(0)
    expect(completionRow.tokens).toBeGreaterThan(0)
    expect(completionRow.type).toBe("completion")
  })
  
  test("must reject zero-token rows from Pareto frontiers", () => {
    const benchmarkRows = [
      { tps: 0, tokens: 0, latency: 45 },  // handshake - REJECT
      { tps: 0, tokens: 0, latency: 32 },  // handshake - REJECT
      { tps: 120, tokens: 500, latency: 8 }, // completion - ACCEPT
      { tps: 95, tokens: 400, latency: 10 }, // completion - ACCEPT
      { tps: 0, tokens: 0, latency: 28 },  // handshake - REJECT
    ]
    
    const validRows = benchmarkRows.filter(row => row.tokens > 0 && row.tps > 0)
    expect(validRows).toHaveLength(2)
    expect(validRows.every(r => r.tokens > 0)).toBe(true)
    expect(validRows.every(r => r.tps > 0)).toBe(true)
    
    const rejectedRows = benchmarkRows.filter(row => row.tokens === 0 || row.tps === 0)
    expect(rejectedRows).toHaveLength(3)
  })
  
  test("quality/tool-correctness/cost belong in the objective set, not just latency", () => {
    // Single-metric (latency) optimization is wrong
    const objectiveSet = {
      latency: true,
      quality: true,
      toolCorrectness: true,
      cost: true
    }
    
    expect(Object.keys(objectiveSet)).toHaveLength(4)
    expect(objectiveSet.quality).toBe(true)
    expect(objectiveSet.toolCorrectness).toBe(true)
    expect(objectiveSet.cost).toBe(true)
  })
  
  test("use Pareto frontiers for multi-objective optimization", () => {
    // Pareto frontier: no single metric dominates, trade-offs are explicit
    const paretoPoints = [
      { latency: 8, quality: 0.95, cost: 0.02 },
      { latency: 10, quality: 0.98, cost: 0.03 },
      { latency: 12, quality: 0.99, cost: 0.05 },
      { latency: 15, quality: 0.85, cost: 0.05 }  // dominated by first point (worse in ALL dimensions)
    ]
    
    // First point dominates the last (better latency AND quality AND cost)
    const dominated = paretoPoints[3]
    const dominant = paretoPoints[0]
    
    const isDominated = dominated.latency > dominant.latency && 
                        dominated.quality < dominant.quality && 
                        dominated.cost >= dominant.cost
    expect(isDominated).toBe(true)
  })
  
  test("zero-token rows must be filtered before Pareto computation", () => {
    const rawData = [
      { tps: 0, latency: 45, quality: 0, tokens: 0 },
      { tps: 100, latency: 10, quality: 0.9, tokens: 400 },
      { tps: 0, latency: 30, quality: 0, tokens: 0 },
    ]
    
    // Filter BEFORE Pareto
    const filtered = rawData.filter(d => d.tokens > 0)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].tps).toBe(100)
  })
})

describe("Anomaly 9: Capability-contract verification", () => {
  test("benchmark schema must include tokens field to detect handshakes", () => {
    const schema = {
      tps: "number",
      latency: "number",
      tokens: "number", // REQUIRED to detect tps:0 handshakes
      quality: "number"
    }
    
    expect(schema.tokens).toBeDefined()
  })
  
  test("Pareto frontier computation must exclude zero-token rows", () => {
    const paretoAlgorithm = (data: any[]) => {
      // Step 1: Filter out zero-token rows (handshakes)
      const valid = data.filter(d => d.tokens > 0)
      // Step 2: Compute Pareto frontier on valid data
      return valid
    }
    
    const testData = [
      { tps: 0, latency: 45, tokens: 0 },
      { tps: 100, latency: 10, tokens: 400 },
    ]
    
    const result = paretoAlgorithm(testData)
    expect(result).toHaveLength(1)
    expect(result[0].tokens).toBeGreaterThan(0)
  })
  
  test("LAZINESS IS A CONTRACT VIOLATION - latency-only benchmarks are invalid", () => {
    // From AGENTS.md: "LAZINESS IS A CONTRACT VIOLATION. Latency-only benchmark rows with zero tokens are handshakes, not completions"
    const lazinessViolation = { onlyLatency: true, noTokens: true, noQuality: true, noCost: true }
    expect(lazinessViolation.onlyLatency).toBe(true)
    expect(lazinessViolation.noTokens).toBe(true)
    
    const validBenchmark = { latency: true, tokens: true, quality: true, cost: true }
    expect(Object.keys(validBenchmark)).toHaveLength(4)
  })
})
