import { describe, expect, test } from "bun:test"
import { KappaSessionProcessor } from "../../src/kappacode/session/processor"

describe("session generation id", () => {
  test("extracts a bounded Gateway generation id", () => {
    expect(
      KappaSessionProcessor.generationID({
        gateway: {
          generationId: " gen_test-123 ",
          routing: { finalProvider: "novita" },
          marketCost: "0.1",
        },
      }),
    ).toBe("gen_test-123")
  })

  test("rejects arbitrary or oversized metadata values", () => {
    expect(KappaSessionProcessor.generationID({ gateway: { generationId: "request-secret" } })).toBeUndefined()
    expect(KappaSessionProcessor.generationID({ gateway: { generationId: `gen_${"a".repeat(201)}` } })).toBeUndefined()
    expect(KappaSessionProcessor.generationID({ gateway: { generationId: 42 } })).toBeUndefined()
    expect(KappaSessionProcessor.generationID({ openai: { responseId: "gen_response" } })).toBeUndefined()
  })
})
