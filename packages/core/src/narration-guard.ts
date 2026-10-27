/**
 * NarrationGuard — Effect-based run-scoped narration guard + semantic brake + cold-tool re-rank.
 * Integrates with the session runner to validate each turn.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs"
import path from "path"
import { Context, Effect, Layer } from "effect"
import { Config } from "./config"
import { FSUtil } from "./fs-util"
import { Location } from "./location"
import { Global } from "./global"

export interface TurnInput {
  readonly turn: number
  readonly runId: string
  readonly reasoning?: string
  readonly text?: string
  readonly toolCalls?: ReadonlyArray<{ readonly name: string; readonly ok?: boolean }>
  readonly receipts?: ReadonlyArray<string>
  readonly priorReasoning?: ReadonlyArray<string>
  readonly toolHistory?: ReadonlyArray<string>
}

export type GuardAction = 
  | { readonly _tag: "accept"; readonly reason: string }
  | { readonly _tag: "continue"; readonly reason: string; readonly inject: string }

export interface NarrationGuard {
  readonly check: (input: TurnInput) => Effect.Effect<GuardAction, Error>
}

export class Service extends Context.Service<Service, NarrationGuard>()("@kappa/NarrationGuard") {}

interface GateConfig {
  proseTokenBudget: number
  pivotBudget: number
  repetitionJaccard: number
  narration: {
    actionPromises: string
    escalateAfter: number
    criticalAfter: number
  }
  semanticBrake: {
    windowTurns: number
    killAt: number
    detectors: ReadonlyArray<string>
  }
  coldTool: {
    lookbackTurns: number
    maxCandidates: number
  }
}

interface Notebook {
  framing?: {
    models?: { verdict?: string }
  }
  reasoningPassthrough?: { honored?: boolean }
  loopTendency?: { selfNgram?: number; runs?: number }
  narrationTendency?: { runs?: number; violations?: number; actionPromises?: number }
  ledger?: ReadonlyArray<{ turn: number; claim: string; evidence: string; next: string }>
}

const DEFAULT_GATE: GateConfig = {
  proseTokenBudget: 900,
  pivotBudget: 2,
  repetitionJaccard: 0.82,
  narration: {
    actionPromises: "\\b(?:on it|running (?:it )?now|starting (?:on )?that|handling (?:it|that)|kicking (?:it|this) off|i[''']ll (?:go|handle|run|start)|working on it|got it, running|let me (?:just )?(?:check|try|look)|recalibrat)\\b",
    escalateAfter: 1,
    criticalAfter: 3,
  },
  semanticBrake: {
    windowTurns: 6,
    killAt: 0.62,
    detectors: ["semantic", "action", "ngram", "edit", "compression"],
  },
  coldTool: {
    lookbackTurns: 4,
    maxCandidates: 5,
  },
}

function words(s = ""): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9_./:-]+/g) ?? []).filter(w => w.length > 2))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let i = 0
  for (const x of a) if (b.has(x)) i++
  return i / (a.size + b.size - i)
}

function tokens(s = ""): number { return Math.ceil(s.length / 4) }

const PIVOT = /\b(oh wait|wait|actually|hold on|let me reconsider|hmm|no no|i mean|scratch that|let me think|recalibrat)\b/gi
function pivots(s = ""): number { return (s.match(PIVOT) ?? []).length }

function loadGateConfig(configDir: string): GateConfig {
  const gatePath = `${configDir}/gate.json`
  if (!existsSync(gatePath)) return DEFAULT_GATE
  try {
    const data = JSON.parse(readFileSync(gatePath, "utf8"))
    return { ...DEFAULT_GATE, ...data }
  } catch {
    return DEFAULT_GATE
  }
}

function loadNotebook(configDir: string): Notebook {
  const nbPath = `${configDir}/notebook.json`
  if (!existsSync(nbPath)) return {}
  try {
    return JSON.parse(readFileSync(nbPath, "utf8"))
  } catch {
    return {}
  }
}

function saveNotebook(configDir: string, nb: Notebook): void {
  const nbPath = `${configDir}/notebook.json`
  const tmp = nbPath + ".tmp"
  writeFileSync(tmp, JSON.stringify(nb, null, 2))
  renameSync(tmp, nbPath)
}

const makeNarrationGuard = Effect.gen(function* () {
  const config = yield* Config.Service
  const fs = yield* FSUtil.Service
  const location = yield* Location.Service
  const global = yield* Global.Service

  const entries = yield* config.entries()
  const gateEntry = entries.find((e): e is { type: "document"; info: { gate?: GateConfig } } => 
    e.type === "document" && e.info.gate !== undefined
  )
  const gateConfig = gateEntry?.info.gate ?? DEFAULT_GATE

  const configDir = path.dirname(global.config)

  const NARR = new RegExp(gateConfig.narration.actionPromises, "i")

  return {
    check: (input: TurnInput): Effect.Effect<GuardAction, never> =>
      Effect.gen(function* () {
        try {
          const prose = `${input.reasoning ?? ""}\n${input.text ?? ""}`
          const calls = input.toolCalls ?? []
          const receipts = input.receipts ?? []

          // 1) Run-scoped narration: action promise with zero tool calls in this runId
          if (NARR.test(prose) && calls.length === 0 && receipts.length === 0) {
            return { _tag: "continue", reason: "narration", inject: "NARRATION_GUARD: action promise with zero tool calls in this runId. End this turn with a ToolCall or a RaceTuple. Prose is not a constructor." } as GuardAction
          }

          // 2) Pivot budget
          if (pivots(prose) >= gateConfig.pivotBudget) {
            return { _tag: "continue", reason: "pivot", inject: "RACE_TUPLE required. Stop prose. Exactly 3 orthogonal candidates, each with a command, a falsifier, and a cost bound. Run via scripts/race-run.sh. Winner = fastest rc=0 with a receipt." } as GuardAction
          }

          // 3) Semantic brake across prior reasoning
          const prior = input.priorReasoning ?? []
          const cur = words(prose)
          if (prior.some(p => jaccard(words(p), cur) >= gateConfig.repetitionJaccard)) {
            const cold = (input.toolHistory ?? []).slice(-gateConfig.coldTool.lookbackTurns)
            return { _tag: "continue", reason: "repetition", inject: `ORTHOGONAL_FORK + COLD_TOOL_RERANK required. Repetition detected. Fork 3 disjoint scopes (A read-only evidence, B /tmp repro, C counterexample). Additionally re-rank cold tools not used in the last ${gateConfig.coldTool.lookbackTurns} turns: ${JSON.stringify(cold)}. Models over-select recent tools (EMNLP 2026); surface the cold candidate explicitly.` } as GuardAction
          }

          // 4) Prose budget
          if (tokens(prose) > gateConfig.proseTokenBudget) {
            return { _tag: "continue", reason: "budget", inject: "RACE_TUPLE required. Prose budget exceeded. 3 orthogonal candidates, each with a falsifier." } as GuardAction
          }

          return { _tag: "accept", reason: calls.length || receipts.length ? "receipt" : "under-budget" } as GuardAction
        } catch {
          return { _tag: "accept", reason: "guard-error" } as GuardAction
        }
      }),
  } satisfies NarrationGuard
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    yield* Config.Service
    yield* FSUtil.Service
    yield* Location.Service
    yield* Global.Service
    return yield* makeNarrationGuard
  }),
)

export const NarrationGuardLayer = layer

import { makeLocationNode } from "./effect/app-node"
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, Location.node, Config.node],
})