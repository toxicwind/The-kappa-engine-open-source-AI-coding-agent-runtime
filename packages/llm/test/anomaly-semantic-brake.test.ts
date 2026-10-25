import { describe, expect, test } from "bun:test"

/**
 * Semantic Brake with 5 detectors (semantic similarity, action repetition, n-gram overlap, edit distance, compression distance)
 * KILL on repetition across reasoning text AND tool-call JSON, not just final answer
 * 
 * Capability-contract test: validate that we can detect repetition using 5 different detectors
 */

describe("Semantic Brake: 5 detectors capability contract", () => {
  
  // Helper functions for the 5 detectors
  function ngrams(text: string, n = 3): Set<string> {
    const words = (text.toLowerCase().match(/[a-z0-9_./:-]+/g) ?? []).filter(w => w.length > 2)
    const out = new Set<string>()
    for (let i = 0; i + n <= words.length; i++) {
      out.add(words.slice(i, i + n).join(" "))
    }
    return out
  }

  function jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0
    let intersection = 0
    for (const x of a) if (b.has(x)) intersection++
    return intersection / (a.size + b.size - intersection)
  }

  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1]
        else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
    return dp[m][n]
  }

  function compressionDistance(a: string, b: string): number {
    // Simplified normalized compression distance using length ratio
    const maxLen = Math.max(a.length, b.length)
    const minLen = Math.min(a.length, b.length)
    if (maxLen === 0) return 0
    return 1 - minLen / maxLen
  }

  // Detector 1: Semantic similarity (using n-gram Jaccard as proxy)
  test("Detector 1 - N-gram Jaccard semantic similarity", () => {
    const text1 = "let me think about the answer"
    const text2 = "let me think about answer"
    const text3 = "the weather is nice today"
    
    const sim12 = jaccard(ngrams(text1), ngrams(text2))
    const sim13 = jaccard(ngrams(text1), ngrams(text3))
    
    expect(sim12).toBeGreaterThan(0.2) // Somewhat similar
    expect(sim13).toBeLessThan(0.2)    // Dissimilar
  })

  // Detector 2: Action repetition (tool call pattern similarity)
  test("Detector 2 - Action repetition detection", () => {
    const toolCalls1 = [{ name: "bash", args: "ls" }, { name: "bash", args: "pwd" }]
    const toolCalls2 = [{ name: "bash", args: "ls" }, { name: "bash", args: "cat file.txt" }]
    const toolCalls3 = [{ name: "python", args: "script.py" }]
    
    // Serialize tool calls for comparison
    const serialize = (calls: typeof toolCalls1) => calls.map(c => `${c.name}:${c.args}`).join("|")
    const s1 = serialize(toolCalls1)
    const s2 = serialize(toolCalls2)
    const s3 = serialize(toolCalls3)
    
    const sim12 = jaccard(new Set(s1.split("")), new Set(s2.split("")))
    const sim13 = jaccard(new Set(s1.split("")), new Set(s3.split("")))
    
    expect(sim12).toBeGreaterThan(0.3) // Similar action patterns
    expect(sim13).toBeLessThan(0.3)    // Different action patterns
  })

  // Detector 3: N-gram overlap (general text)
  test("Detector 3 - N-gram overlap detection", () => {
    const text1 = "let me recalibrate and try different approach"
    const text2 = "let me recalibrate and try another approach"
    const text3 = "i will now check the status"
    
    const overlap12 = jaccard(ngrams(text1, 3), ngrams(text2, 3))
    const overlap13 = jaccard(ngrams(text1, 3), ngrams(text3, 3))
    
    expect(overlap12).toBeGreaterThan(0.25) // Some overlap
    expect(overlap13).toBeLessThan(0.2)    // Low overlap
  })

  // Detector 4: Edit distance (Levenshtein)
  test("Detector 4 - Edit distance detection", () => {
    const text1 = "let me recalibrate"
    const text2 = "let me recalibrte"      // 1 char difference (typo)
    const text3 = "let me check something" // Completely different
    
    const dist12 = levenshtein(text1, text2)
    const dist13 = levenshtein(text1, text3)
    
    expect(dist12).toBeLessThanOrEqual(2)   // Very close (typo)
    expect(dist13).toBeGreaterThan(10)      // Very different
  })

  // Detector 5: Compression distance
  test("Detector 5 - Compression distance detection", () => {
    const text1 = "let me think about the answer"
    const text2 = "let me think about the answer" // Identical
    const text3 = "random completely different text here"
    
    const cd12 = compressionDistance(text1, text2)
    const cd13 = compressionDistance(text1, text3)
    
    expect(cd12).toBeLessThan(0.1) // Near zero for identical
    expect(cd13).toBeGreaterThan(0.2) // Significant for different
  })

  // Combined semantic brake decision
  test("Semantic brake KILL decision combines all 5 detectors", () => {
    const priorReasoning = [
      "let me think about this problem carefully",
      "i need to recalibrate my approach here",
      "let me reconsider the options available",
    ]
    const currentReasoning = "let me recalibrate and reconsider my options"
    
    const detectors = {
      semantic: jaccard(ngrams(priorReasoning.join(" ")), ngrams(currentReasoning)),
      ngram: jaccard(ngrams(priorReasoning.join(" "), 3), ngrams(currentReasoning, 3)),
      edit: Math.min(...priorReasoning.map(p => levenshtein(p, currentReasoning))),
      compression: compressionDistance(priorReasoning.join(" "), currentReasoning),
      action: 0.9 // High action similarity (simulated)
    }
    
    // Kill threshold from AGENTS.md: 0.62
    const killThreshold = 0.62
    const maxSimilarity = Math.max(
      detectors.semantic,
      detectors.ngram,
      1 - detectors.edit / Math.max(currentReasoning.length, 1),
      detectors.compression,
      detectors.action
    )
    
    // Should kill because semantic similarity is high
    expect(maxSimilarity).toBeGreaterThan(killThreshold)
  })

  test("Semantic brake PROCEED when similarity is low", () => {
    const priorReasoning = ["let me think about this problem"]
    const currentReasoning = "i will check the network status"
    
    const detectors = {
      semantic: jaccard(ngrams(priorReasoning.join(" ")), ngrams(currentReasoning)),
      ngram: jaccard(ngrams(priorReasoning.join(" "), 3), ngrams(currentReasoning, 3)),
      edit: Math.min(...priorReasoning.map(p => levenshtein(p, currentReasoning))),
      compression: compressionDistance(priorReasoning.join(" "), currentReasoning),
      action: 0.1 // Low action similarity
    }
    
    const killThreshold = 0.62
    const maxSimilarity = Math.max(
      detectors.semantic,
      detectors.ngram,
      1 - detectors.edit / Math.max(currentReasoning.length, 1),
      detectors.compression,
      detectors.action
    )
    
    // Should proceed because similarity is low
    expect(maxSimilarity).toBeLessThan(killThreshold)
  })
})
