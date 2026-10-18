// kappacode_change - new file
import { describe, expect, test } from "bun:test"
import { KappaSessionProcessor } from "../../src/kappacode/session/processor.ts"
import type { MessageV2 } from "../../src/session/message-v2.ts"

const REVIEW_COMMANDS = ["review"] as const

const expected = (command: (typeof REVIEW_COMMANDS)[number]) => ({
  mode: "review" as const,
  feature: "code_reviews" as const,
  command,
})

describe("KappaSessionProcessor.reviewTelemetry", () => {
  for (const command of REVIEW_COMMANDS) {
    test(`returns telemetry for ${command}`, () => {
      expect(KappaSessionProcessor.reviewTelemetry(command)).toEqual(expected(command))
    })
  }

  test("returns undefined for an unrelated command", () => {
    expect(KappaSessionProcessor.reviewTelemetry("init")).toBeUndefined()
  })

  test("returns undefined for an undefined command", () => {
    expect(KappaSessionProcessor.reviewTelemetry(undefined)).toBeUndefined()
  })
})

describe("KappaSessionProcessor.markReviewTelemetry", () => {
  for (const command of REVIEW_COMMANDS) {
    test(`stamps text parts with telemetry for ${command}`, () => {
      const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [
        { type: "text", metadata: { existing: "keep" } },
        { type: "file" },
        { type: "text" },
      ]
      const tel = KappaSessionProcessor.markReviewTelemetry(parts, command)
      expect(tel).toEqual(expected(command))
      expect(parts[0].metadata).toEqual({ existing: "keep", ...expected(command) })
      expect(parts[1].metadata).toBeUndefined()
      expect(parts[2].metadata).toEqual({ ...expected(command) })
    })
  }

  test("does nothing for an unrelated command", () => {
    const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [{ type: "text" }]
    expect(KappaSessionProcessor.markReviewTelemetry(parts, "init")).toBeUndefined()
    expect(parts[0].metadata).toBeUndefined()
  })

  test("does nothing for an undefined command", () => {
    const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [{ type: "text" }]
    expect(KappaSessionProcessor.markReviewTelemetry(parts, undefined)).toBeUndefined()
    expect(parts[0].metadata).toBeUndefined()
  })
})

describe("KappaSessionProcessor.markCommand", () => {
  test("labels text parts with the typed command and keeps other kappa metadata", () => {
    const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [
      { type: "text", metadata: { mode: "review", kappa: { review: { version: 1 } } } },
      { type: "file" },
    ]
    KappaSessionProcessor.markCommand(parts, "review", "branch ")
    expect(parts[0].metadata).toEqual({
      mode: "review",
      kappa: { review: { version: 1 }, injected: { title: "/review branch" } },
    })
    expect(parts[1].metadata).toBeUndefined()
  })
})

describe("KappaSessionProcessor.extractReviewTelemetry", () => {
  for (const command of REVIEW_COMMANDS) {
    test(`recovers ${command} telemetry from marked text parts`, () => {
      const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [{ type: "text" }]
      KappaSessionProcessor.markReviewTelemetry(parts, command)
      const round = KappaSessionProcessor.extractReviewTelemetry(parts as unknown as MessageV2.Part[])
      expect(round).toEqual(expected(command))
    })
  }

  test("returns undefined when parts have no review metadata", () => {
    const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [
      { type: "text" },
      { type: "text", metadata: { foo: "bar" } },
    ]
    expect(KappaSessionProcessor.extractReviewTelemetry(parts as unknown as MessageV2.Part[])).toBeUndefined()
  })

  test("returns undefined when command in metadata is unknown", () => {
    const parts: Array<{ type: string; metadata?: Record<string, unknown> }> = [
      { type: "text", metadata: { mode: "review", feature: "code_reviews", command: "unknown" } },
    ]
    expect(KappaSessionProcessor.extractReviewTelemetry(parts as unknown as MessageV2.Part[])).toBeUndefined()
  })
})

describe("KappaSessionProcessor.suggestionReviewTelemetry", () => {
  test("returns suggest-sourced telemetry for accepted review commands", () => {
    expect(
      KappaSessionProcessor.suggestionReviewTelemetry({
        accepted: { prompt: "/review uncommitted --focus telemetry" },
      }),
    ).toEqual({ ...expected("review"), tool: "suggest" })
  })

  test("returns undefined for accepted non-review commands", () => {
    expect(KappaSessionProcessor.suggestionReviewTelemetry({ accepted: { prompt: "/test" } })).toBeUndefined()
  })

  test("returns undefined when accepted prompt is not a slash command", () => {
    expect(KappaSessionProcessor.suggestionReviewTelemetry({ accepted: { prompt: "Run tests" } })).toBeUndefined()
  })

  test("returns undefined when accepted metadata is missing", () => {
    expect(KappaSessionProcessor.suggestionReviewTelemetry({ dismissed: true })).toBeUndefined()
  })
})

describe("KappaSessionProcessor.extractSuggestionReviewTelemetry", () => {
  test("recovers review telemetry from completed suggest tool metadata", () => {
    const parts = [
      {
        type: "tool",
        tool: "suggest",
        state: {
          status: "completed",
          metadata: { accepted: { prompt: "/review branch" } },
        },
      },
    ]

    expect(KappaSessionProcessor.extractSuggestionReviewTelemetry(parts as unknown as MessageV2.Part[])).toEqual({
      ...expected("review"),
      tool: "suggest",
    })
  })
})
