import { describe, expect, test } from "bun:test"

// Test the core dedup matching logic used in openai-chat.ts
// The parser checks: normalized delta content is a suffix of normalized accumulated reasoning text

function shouldDedup(accumulatedReasoning: string, contentDelta: string): boolean {
  const normalizedDelta = contentDelta.replace(/\s+/g, " ").trim()
  const normalizedReasoning = accumulatedReasoning.replace(/\s+/g, " ").trim()

  if (!normalizedReasoning || !normalizedDelta) return false
  if (normalizedReasoning.length < normalizedDelta.length) return false

  return normalizedReasoning.endsWith(normalizedDelta)
}

describe("reasoning dedup matcher", () => {
  test("drops content that matches reasoning tail", () => {
    expect(shouldDedup("Let me think about the answer", "answer")).toBe(true)
    expect(shouldDedup("Let me think about the answer", " about the answer")).toBe(true)
    expect(shouldDedup("Let me think about the answer", "Let me think about the answer")).toBe(true)
  })

  test("passes through content that does not match", () => {
    expect(shouldDedup("Let me think", "Actual answer")).toBe(false)
    expect(shouldDedup("thinking", "The answer is 42")).toBe(false)
    expect(shouldDedup("hello", "world")).toBe(false)
  })

  test("handles whitespace differences via normalization", () => {
    expect(shouldDedup("Let  me   think\nabout\tthe", "  about the  ")).toBe(true)
    expect(shouldDedup("Let me think", "  think")).toBe(true)
  })

  test("empty reasoning does not dedup", () => {
    expect(shouldDedup("", "anything")).toBe(false)
  })

  test("empty delta does not dedup", () => {
    expect(shouldDedup("anything", "")).toBe(false)
  })
})
