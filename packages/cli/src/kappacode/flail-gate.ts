/**
 * Flail Gate — Framing-Aware Discovery + Run-Scoped Narration Guard + Semantic Brake
 * Integrated into kappa-code runtime from the kappa product flail gate system.
 */

import { Cause, Context, Effect, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { Global } from "@opencode-ai/core/global"
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { join } from "node:path"
const log = Log.create({ service: "kappacode.flail-gate" })

// ── Gate Config Schema ────────────────────────────────────────────────

export const GateConfig = Schema.Struct({
  proseTokenBudget: Schema.Int.check(Schema.isGreaterThan(0)),
  pivotBudget: Schema.Int.check(Schema.isGreaterThan(0)),
  repetitionJaccard: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1)),
  raceSeconds: Schema.Int.check(Schema.isGreaterThan(0)),
  narration: Schema.Struct({
    actionPromises: Schema.String,
    escalateAfter: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    criticalAfter: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    ttlMinutes: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  semanticBrake: Schema.Struct({
    windowTurns: Schema.Int.check(Schema.isGreaterThan(0)),
    killAt: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1)),
    detectors: Schema.Array(Schema.String),
  }),
  coldTool: Schema.Struct({
    lookbackTurns: Schema.Int.check(Schema.isGreaterThan(0)),
    maxCandidates: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
})
export type GateConfig = Schema.Schema.Type<typeof GateConfig>

// ── Notebook/Ledger Schema ────────────────────────────────────────────

export const FramingVerdict = Schema.Literals(["Buffered", "SseCorrupted", "Sse", "Absent", "Error", "unprobed"])
export type FramingVerdict = Schema.Schema.Type<typeof FramingVerdict>

export const FramingInfo = Schema.Struct({
  probed: Schema.Boolean,
  models: Schema.Struct({
    verdict: FramingVerdict,
    path: Schema.optional(Schema.NullOr(Schema.String)),
    evidence: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          status: Schema.Int,
          ctype: Schema.String,
          bytes: Schema.Int,
        }),
      ),
    ),
  }),
  completions: Schema.Struct({
    verdict: FramingVerdict,
    path: Schema.optional(Schema.NullOr(Schema.String)),
    evidence: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          status: Schema.Int,
          ctype: Schema.String,
          bytes: Schema.Int,
        }),
      ),
    ),
  }),
})
export type FramingInfo = Schema.Schema.Type<typeof FramingInfo>

export const ReasoningPassthrough = Schema.Struct({
  honored: Schema.optional(Schema.NullOr(Schema.Boolean)),
  field: Schema.optional(Schema.NullOr(Schema.String)),
  model: Schema.optional(Schema.NullOr(Schema.String)),
})
export type ReasoningPassthrough = Schema.Schema.Type<typeof ReasoningPassthrough>

export const LoopTendency = Schema.Struct({
  selfNgram: Schema.optional(Schema.NullOr(Schema.Number)),
  semantic: Schema.optional(Schema.NullOr(Schema.Number)),
  runs: Schema.Int,
})
export type LoopTendency = Schema.Schema.Type<typeof LoopTendency>

export const NarrationTendency = Schema.Struct({
  runs: Schema.Int,
  violations: Schema.Int,
  actionPromises: Schema.Int,
})
export type NarrationTendency = Schema.Schema.Type<typeof NarrationTendency>

export const Probe = Schema.Union([
  Schema.Struct({
    path: Schema.String,
    status: Schema.Int,
    ctype: Schema.String,
    bytes: Schema.Int,
    verdict: FramingVerdict,
    note: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("completions"),
    model: Schema.String,
    honored: Schema.Boolean,
    selfNgram: Schema.Number,
    narration: Schema.Int,
    promises: Schema.Int,
  }),
])
export type Probe = Schema.Schema.Type<typeof Probe>

export const Notebook = Schema.Struct({
  session: Schema.String,
  base: Schema.String,
  framing: FramingInfo,
  reasoningPassthrough: ReasoningPassthrough,
  loopTendency: LoopTendency,
  narrationTendency: NarrationTendency,
  catalog: Schema.Array(Schema.String),
  ledger: Schema.Array(Schema.Unknown),
  probes: Schema.Array(Probe),
  // Epoch ms of the last completed probe round. Absent on notebooks written
  // before this field existed, which simply means "probe on next boot".
  probedAt: Schema.optional(Schema.Number),
})
export type Notebook = Schema.Schema.Type<typeof Notebook>

// A completed probe round stays valid for 24h. Without this, every boot
// re-fires the whole discovery round against the shared lane: up to 11
// model-matrix GETs + a catalog fetch + up to 21 chat completions (7 per
// model x 3 models), all outside LLMQueue, against a 2-concurrency shed
// that tau and other kappa processes share. That bootstrap flood is the
// self-inflicted 429 source: reuse the cached round while fresh.
export const PROBE_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_CACHED_PROBES = 200

export function probesFresh(nb: Notebook, now = Date.now()): boolean {
  return typeof nb.probedAt === "number" && Number.isFinite(nb.probedAt) && now - nb.probedAt < PROBE_TTL_MS
}

export function cachedProbeModels(nb: Notebook): Array<{
  model: string
  honored: boolean
  selfNgram: number
  narration: number
}> {
  const latest = new Map<string, { model: string; honored: boolean; selfNgram: number; narration: number }>()
  for (const p of nb.probes ?? []) {
    if (!("kind" in p) || p.kind !== "completions") continue
    latest.set(p.model, { model: p.model, honored: p.honored, selfNgram: p.selfNgram, narration: p.narration })
  }
  return [...latest.values()]
}

// ── File Paths ────────────────────────────────────────────────────────

const CONFIG_DIR = join(Global.Path.config, "flail-gate")
const GATE_FILE = join(CONFIG_DIR, "gate.json")
const NOTEBOOK_FILE = join(CONFIG_DIR, "notebook.json")

const DEFAULT_GATE = {
  proseTokenBudget: 900,
  pivotBudget: 2,
  repetitionJaccard: 0.82,
  raceSeconds: 8,
  narration: {
    actionPromises:
      "\\b(?:on it|running (?:it )?now|starting (?:on )?that|handling (?:it|that)|kicking (?:it|this) off|i[''']ll (?:go|handle|run|start)|working on it|got it, running|let me (?:just )?(?:check|try|look)|recalibrat)\\b",
    escalateAfter: 1,
    criticalAfter: 3,
    ttlMinutes: 10,
  },
  semanticBrake: {
    windowTurns: 6,
    killAt: 0.62,
    detectors: ["semantic", "action", "ngram", "edit", "compression"],
  },
  coldTool: { lookbackTurns: 4, maxCandidates: 5 },
}

const FRESH_NOTEBOOK = () => ({
  session: `run-${Date.now()}`,
  base: "unset",
  framing: {
    probed: false,
    models: { verdict: "unprobed" as FramingVerdict, path: null, evidence: null },
    completions: { verdict: "unprobed" as FramingVerdict, path: null, evidence: null },
  },
  reasoningPassthrough: { honored: null, field: null, model: null },
  loopTendency: { selfNgram: null, semantic: null, runs: 0 },
  narrationTendency: { runs: 0, violations: 0, actionPromises: 0 },
  catalog: [],
  ledger: [],
  probes: [],
})

// ── Gate State ────────────────────────────────────────────────────────

let gateConfig: GateConfig | null = null
let notebook: Notebook | null = null

function loadGate(): GateConfig {
  if (gateConfig) return gateConfig
  try {
    const text = readFileSync(GATE_FILE, "utf8")
    gateConfig = JSON.parse(text) as GateConfig
    return gateConfig
  } catch (err) {
    if (!existsSync(GATE_FILE)) {
      gateConfig = Schema.decodeUnknownSync(GateConfig)(DEFAULT_GATE)
      return gateConfig
    }
    log.warn("failed to load gate.json, using defaults", { err })
    gateConfig = Schema.decodeUnknownSync(GateConfig)(DEFAULT_GATE)
    return gateConfig
  }
}

function loadNotebook(): Notebook {
  if (notebook) return notebook
  try {
    const text = readFileSync(NOTEBOOK_FILE, "utf8")
    notebook = JSON.parse(text) as Notebook
    return notebook
  } catch (err) {
    if (existsSync(NOTEBOOK_FILE)) {
      log.warn("failed to load notebook.json, creating fresh", { err })
    }
    notebook = Schema.decodeUnknownSync(Notebook)(FRESH_NOTEBOOK())
    return notebook
  }
}

function saveNotebook(nb: Notebook): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const tmp = NOTEBOOK_FILE + ".tmp"
  writeFileSync(tmp, JSON.stringify(nb, null, 2))
  renameSync(tmp, NOTEBOOK_FILE)
  notebook = nb
}

// ── Narration Guard ──────────────────────────────────────────────────

const NARRATION_RE = new RegExp(loadGate().narration.actionPromises, "i")
const PIVOT_RE =
  /\b(oh wait|wait|actually|hold on|let me reconsider|hmm|no no|i mean|scratch that|let me think|recalibrat)\b/gi

export interface TurnInput {
  turn: number
  runId: string
  reasoning?: string
  text?: string
  toolCalls?: Array<{ name: string; ok?: boolean }>
  receipts?: string[]
  priorReasoning?: string[]
  toolHistory?: string[]
}

export interface GuardResult {
  action: "accept" | "continue"
  reason: string
  inject?: string
}

export function narrationGuard(input: TurnInput): GuardResult {
  const cfg = loadGate()
  const prose = `${input.reasoning ?? ""}\n${input.text ?? ""}`
  const calls = input.toolCalls ?? []
  const receipts = input.receipts ?? []

  // 1) Run-scoped narration: whole runId, not last message
  if (NARRATION_RE.test(prose) && calls.length === 0 && receipts.length === 0) {
    return {
      action: "continue",
      reason: "narration",
      inject:
        "NARRATION_GUARD: action promise with zero tool calls in this runId. End this turn with a ToolCall or a RaceTuple. Prose is not a constructor.",
    }
  }

  // 2) Pivot budget
  const pivots = (prose.match(PIVOT_RE) ?? []).length
  if (pivots >= cfg.pivotBudget) {
    return {
      action: "continue",
      reason: "pivot",
      inject:
        "RACE_TUPLE required. Stop prose. Exactly 3 orthogonal candidates, each with a command, a falsifier, and a cost bound. Run via scripts/race-run.sh. Winner = fastest rc=0 with a receipt.",
    }
  }

  // 3) Semantic brake across prior reasoning
  const prior = input.priorReasoning ?? []
  const curWords = words(prose)
  if (prior.some((p) => jaccard(words(p), curWords) >= cfg.repetitionJaccard)) {
    const cold = (input.toolHistory ?? []).slice(-cfg.coldTool.lookbackTurns)
    return {
      action: "continue",
      reason: "repetition",
      inject: `ORTHOGONAL_FORK + COLD_TOOL_RERANK required. Repetition detected. Fork 3 disjoint scopes (A read-only evidence, B /tmp repro, C counterexample). Additionally re-rank cold tools not used in the last ${cfg.coldTool.lookbackTurns} turns: ${JSON.stringify(cold)}. Models over-select recent tools (EMNLP 2026); surface the cold candidate explicitly.`,
    }
  }

  // 4) Prose budget
  if (tokens(prose) > cfg.proseTokenBudget) {
    return {
      action: "continue",
      reason: "budget",
      inject: "RACE_TUPLE required. Prose budget exceeded. 3 orthogonal candidates, each with a falsifier.",
    }
  }

  return {
    action: "accept",
    reason: calls.length || receipts.length ? "receipt" : "under-budget",
  }
}

function words(s = ""): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9_./:-]+/g) ?? []).filter((w) => w.length > 2))
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let i = 0
  for (const x of a) if (b.has(x)) i++
  return i / (a.size + b.size - i)
}
function tokens(s = ""): number {
  return Math.ceil(s.length / 4)
}

// ── Framing-Aware Discovery ──────────────────────────────────────────

const MODEL_MATRIX = [
  "/models",
  "/models?alt=sse",
  "/models?stream=true",
  "/models?stream=1",
  "/models/stream",
  "/models/events",
  "/models:stream",
  "/models?watch=true",
  "/models/changes",
  "/model",
  "/models?category=llm",
] as const

export async function probeModels(
  baseUrl: string,
  apiKey: string,
): Promise<{
  verdict: FramingVerdict
  path: string | null
  evidence: { status: number; ctype: string; bytes: number } | null
  probes: Array<{ path: string; status: number; ctype: string; bytes: number; verdict: FramingVerdict; note: string }>
}> {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "*/*" }
  const probes: Array<{
    path: string
    status: number
    ctype: string
    bytes: number
    verdict: FramingVerdict
    note: string
  }> = []

  for (const path of MODEL_MATRIX) {
    let status = 0,
      ctype = "",
      body = ""
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      status = response.status
      ctype = response.headers.get("content-type") ?? ""
      body = await response.text()
    } catch (e: any) {
      body = String(e?.message ?? e)
    }

    const verdict = classify(status, ctype, body)
    probes.push({ path, status, ctype, bytes: body.length, verdict, note: body.slice(0, 120).replace(/\s+/g, " ") })
    if (verdict === "Buffered") break
  }

  const winner =
    probes.find((p) => p.verdict === "Buffered") ??
    probes.find((p) => p.verdict === "SseCorrupted") ??
    probes.find((p) => p.verdict === "Sse") ??
    probes.find((p) => p.verdict === "Absent")

  return {
    verdict: winner?.verdict ?? "Absent",
    path: winner?.path ?? null,
    evidence: winner ? { status: winner.status, ctype: winner.ctype, bytes: winner.bytes } : null,
    probes,
  }
}

function classify(status: number, ctype: string, body: string): FramingVerdict {
  if (status === 404) return "Absent"
  if (status === 0 || status >= 500) return "Error"
  const isSse = /text\/event-stream/i.test(ctype) || /^(data|event):/m.test(body.slice(0, 512))
  if (!isSse) {
    try {
      const j = JSON.parse(body)
      return j && (j.data || j.object) ? "Buffered" : "Error"
    } catch {
      return "Error"
    }
  }
  const hasErrorFrame = /event:\s*error|\bproxy_stream_error\b|"error"\s*:/.test(body)
  const hasPartialJson = /^\s*\{/.test(body) && !/\}\s*$/.test(body.trim())
  return hasErrorFrame || hasPartialJson ? "SseCorrupted" : "Sse"
}

// ── Completion Probe ─────────────────────────────────────────────────

export async function probeCompletions(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{
  honored: boolean
  selfNgram: number
  narration: number
  promises: number
}> {
  const cfg = loadGate()
  const narrRe = new RegExp(cfg.narration.actionPromises, "i")
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }

  async function call(extra: Record<string, string> = {}, body: any = {}) {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 256, ...body }),
      signal: AbortSignal.timeout(45000),
    })
    const text = await r.text()
    let j: any = null
    try {
      j = JSON.parse(text)
    } catch {}
    return { status: r.status, text, j }
  }

  function content(j: any): string {
    try {
      return j.choices?.[0]?.message?.content ?? ""
    } catch {
      return ""
    }
  }
  function hasReasoning(j: any): boolean {
    return /"reasoning_content"\s*:/.test(JSON.stringify(j ?? {}))
  }
  function ngrams(s: string, n = 3): Set<string> {
    const w = s.toLowerCase().match(/[a-z0-9]+/g) ?? []
    const out = new Set<string>()
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "))
    return out
  }
  function jac(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0
    let i = 0
    for (const x of a) if (b.has(x)) i++
    return i / (a.size + b.size - i)
  }

  // 1) Reasoning passthrough
  const offR = await call(
    { "X-Reasoning-Passthrough": "false" },
    { messages: [{ role: "user", content: "Reply with exactly: PONG" }] },
  )
  const onR = await call(
    { "X-Reasoning-Passthrough": "true" },
    { messages: [{ role: "user", content: "Reply with exactly: PONG" }] },
  )
  const honored = hasReasoning(onR.j) && !hasReasoning(offR.j)

  // 2) Loop + narration tendency
  const PROMPT = "List three ways to verify a port is listening, then stop. Do not explain."
  const texts: string[] = []
  let narration = 0,
    promises = 0
  for (let i = 0; i < 5; i++) {
    const r = await call(
      { "X-Reasoning-Passthrough": honored ? "true" : "false" },
      { messages: [{ role: "user", content: PROMPT }], tools: [] },
    )
    const t = content(r.j)
    texts.push(t)
    if (narrRe.test(t)) promises++
    const tc = (r.j?.choices?.[0]?.message?.tool_calls ?? []).length
    if (narrRe.test(t) && tc === 0) narration++
  }
  const pairs: number[] = []
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) pairs.push(jac(ngrams(texts[i]), ngrams(texts[j])))
  const selfNgram = pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : 0

  // 3) Update notebook
  const nb = loadNotebook()
  saveNotebook({
    ...nb,
    reasoningPassthrough: { honored, field: honored ? "reasoning_content" : null, model },
    loopTendency: { selfNgram: +selfNgram.toFixed(3), semantic: null, runs: texts.length },
    narrationTendency: { runs: texts.length, violations: narration, actionPromises: promises },
    probes: [
      ...nb.probes,
      { kind: "completions", model, honored, selfNgram: +selfNgram.toFixed(3), narration, promises },
    ],
  })

  // 4) Adapt gate thresholds from measurement
  const gate = loadGate()
  saveGate({
    ...gate,
    proseTokenBudget: selfNgram > 0.5 ? 600 : gate.proseTokenBudget,
    pivotBudget: selfNgram > 0.5 ? 1 : gate.pivotBudget,
    narration: {
      ...gate.narration,
      escalateAfter: narration > 0 ? 1 : gate.narration.escalateAfter,
      criticalAfter: narration > 0 ? 2 : gate.narration.criticalAfter,
    },
  })

  return { honored, selfNgram, narration, promises }
}

function saveGate(gate: GateConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const tmp = GATE_FILE + ".tmp"
  writeFileSync(tmp, JSON.stringify(gate, null, 2))
  renameSync(tmp, GATE_FILE)
  gateConfig = gate
}

// ── Initialization ──────────────────────────────────────────────────

export async function initializeFlailGate(): Promise<{
  framing: { verdict: FramingVerdict; path: string | null }
  models: Array<{ model: string; honored: boolean; selfNgram: number; narration: number }>
}> {
  const nb = loadNotebook()
  const baseUrl = process.env.FREEINFERENCE_API_BASE ?? "https://freeinference.org/v1"
  const apiKey = process.env.FREEINFERENCE_API_KEY

  if (process.env.KAPPA_FLAIL_PROBES === "0") {
    log.warn("KAPPA_FLAIL_PROBES=0, skipping flail gate probes")
    return { framing: { verdict: "unprobed", path: null }, models: [] }
  }

  if (!apiKey) {
    log.warn("FREEINFERENCE_API_KEY not set, skipping flail gate probes")
    return { framing: { verdict: "unprobed", path: null }, models: [] }
  }

  // Fresh cached round: skip the network entirely. The bootstrap probe
  // flood is the lane's own 429 source; the guard reads thresholds from
  // gate.json and the notebook, both of which the last round already wrote.
  if (probesFresh(nb) && nb.framing.models.verdict !== "unprobed") {
    log.warn("flail gate probes fresh, reusing cached round")
    return {
      framing: { verdict: nb.framing.models.verdict, path: nb.framing.models.path ?? null },
      models: cachedProbeModels(nb),
    }
  }

  // 1) Probe model catalog framing
  const framing = await probeModels(baseUrl, apiKey)
  saveNotebook({
    ...nb,
    framing: { ...nb.framing, models: { verdict: framing.verdict, path: framing.path, evidence: framing.evidence } },
    probes: [...(nb.probes ?? []), ...framing.probes],
  })

  // 2) Get catalog models
  let modelIds: string[] = []
  try {
    const catalog = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    const data = await catalog.json()
    modelIds = data.data?.map((m: any) => m.id).filter((id: string) => typeof id === "string") ?? []
  } catch {
    log.warn("failed to fetch model catalog")
  }

  // 3) Probe completions for up to 3 models
  const models: Array<{ model: string; honored: boolean; selfNgram: number; narration: number }> = []
  for (const modelId of modelIds.slice(0, 3)) {
    try {
      const result = await probeCompletions(baseUrl, apiKey, modelId)
      models.push({ model: modelId, ...result })
    } catch (err) {
      log.warn("probe-completions failed", { model: modelId, err })
    }
  }

  // Stamp the completed round and bound the ledger: without the cap the
  // probes array grows by ~14 entries on every boot, forever.
  const fresh = loadNotebook()
  saveNotebook({ ...fresh, probedAt: Date.now(), probes: (fresh.probes ?? []).slice(-MAX_CACHED_PROBES) })

  return { framing: { verdict: framing.verdict, path: framing.path }, models }
}

// ── Exported Service ────────────────────────────────────────────────

export class FlailGate extends Context.Service<
  FlailGate,
  {
    readonly narrationGuard: (input: TurnInput) => Effect.Effect<GuardResult>
    readonly initialize: () => Effect.Effect<{
      framing: { verdict: FramingVerdict; path: string | null }
      models: Array<{ model: string; honored: boolean; selfNgram: number; narration: number }>
    }>
    readonly loadGate: () => GateConfig
    readonly loadNotebook: () => Notebook
    readonly probeModels: (baseUrl: string, apiKey: string) => Effect.Effect<Awaited<ReturnType<typeof probeModels>>>
    readonly probeCompletions: (
      baseUrl: string,
      apiKey: string,
      model: string,
    ) => Effect.Effect<Awaited<ReturnType<typeof probeCompletions>>>
  }
>()("@kappacode/FlailGate") {}

export const live = Effect.gen(function* () {
  // Initialize on service creation
  yield* Effect.promise(() => initializeFlailGate()).pipe(
    Effect.catchCause((cause) => {
      log.warn("flail gate initialization failed", { err: Cause.squash(cause) })
      return Effect.succeed({ framing: { verdict: "unprobed", path: null }, models: [] })
    }),
  )

  return FlailGate.of({
    narrationGuard: (input) => Effect.succeed(narrationGuard(input)),
    initialize: () => Effect.promise(() => initializeFlailGate()),
    loadGate: () => loadGate(),
    loadNotebook: () => loadNotebook(),
    probeModels: (baseUrl, apiKey) => Effect.promise(() => probeModels(baseUrl, apiKey)),
    probeCompletions: (baseUrl, apiKey, model) => Effect.promise(() => probeCompletions(baseUrl, apiKey, model)),
  })
}).pipe(
  Effect.catchCause((cause) => {
    log.error("flail gate service creation failed", { err: Cause.squash(cause) })
    return Effect.succeed(
      FlailGate.of({
        narrationGuard: (input) => Effect.succeed({ action: "accept", reason: "gate-unavailable" }),
        initialize: () => Effect.succeed({ framing: { verdict: "unprobed", path: null }, models: [] }),
        loadGate: () => loadGate(),
        loadNotebook: () => loadNotebook(),
        probeModels: () => Effect.succeed({ verdict: "unprobed", path: null, evidence: null, probes: [] }),
        probeCompletions: () => Effect.succeed({ honored: false, selfNgram: 0, narration: 0, promises: 0 }),
      }),
    )
  }),
)
