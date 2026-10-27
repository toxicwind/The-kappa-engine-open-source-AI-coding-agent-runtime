import { describe, it, expect } from "bun:test"
import { probesFresh, cachedProbeModels, PROBE_TTL_MS, type Notebook } from "@/kappacode/flail-gate"

function base(nb: Partial<Notebook>): Notebook {
  return {
    session: "run-test",
    base: "unset",
    framing: {
      probed: false,
      models: { verdict: "unprobed", path: null, evidence: null },
      completions: { verdict: "unprobed", path: null, evidence: null },
    },
    reasoningPassthrough: { honored: null, field: null, model: null },
    loopTendency: { selfNgram: null, semantic: null, runs: 0 },
    narrationTendency: { runs: 0, violations: 0, actionPromises: 0 },
    catalog: [],
    ledger: [],
    probes: [],
    ...nb,
  } as Notebook
}

describe("probesFresh", () => {
  it("is false when probedAt is absent (pre-field notebooks probe on next boot)", () => {
    expect(probesFresh(base({}), 1_000_000)).toBe(false)
  })

  it("is true inside the TTL window", () => {
    expect(probesFresh(base({ probedAt: 1_000_000 }), 1_000_000 + PROBE_TTL_MS - 1)).toBe(true)
  })

  it("is false once the TTL expires", () => {
    expect(probesFresh(base({ probedAt: 1_000_000 }), 1_000_000 + PROBE_TTL_MS)).toBe(false)
  })

  it("is false for non-finite probedAt", () => {
    expect(probesFresh(base({ probedAt: Number.NaN }), 1_000_000)).toBe(false)
  })
})

describe("cachedProbeModels", () => {
  it("returns the latest completion probe per model and skips framing probes", () => {
    const nb = base({
      probes: [
        { path: "/models", status: 200, ctype: "application/json", bytes: 10, verdict: "Absent", note: "" },
        { kind: "completions", model: "m-a", honored: false, selfNgram: 0.1, narration: 0, promises: 0 },
        { kind: "completions", model: "m-b", honored: true, selfNgram: 0.2, narration: 1, promises: 1 },
        { kind: "completions", model: "m-a", honored: true, selfNgram: 0.3, narration: 2, promises: 2 },
      ] as Notebook["probes"],
    })
    expect(cachedProbeModels(nb)).toEqual([
      { model: "m-a", honored: true, selfNgram: 0.3, narration: 2 },
      { model: "m-b", honored: true, selfNgram: 0.2, narration: 1 },
    ])
  })

  it("returns an empty list when no completion probes exist", () => {
    expect(cachedProbeModels(base({}))).toEqual([])
  })
})
