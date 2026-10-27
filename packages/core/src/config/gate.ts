export * as ConfigGate from "./gate"

import { Schema } from "effect"

export class Narration extends Schema.Class<Narration>("ConfigGate.Narration")({
  actionPromises: Schema.String.pipe(Schema.optional).annotate({
    description: "Regex for action-promise keywords that trigger narration guard",
  }),
  escalateAfter: Schema.Number.pipe(Schema.optional).annotate({
    description: "Violations before WARN escalation",
  }),
  criticalAfter: Schema.Number.pipe(Schema.optional).annotate({
    description: "Violations before CRITICAL escalation",
  }),
  ttlMinutes: Schema.Number.pipe(Schema.optional).annotate({
    description: "Time-to-live for violation tracking in minutes",
  }),
}) {}

export class SemanticBrake extends Schema.Class<SemanticBrake>("ConfigGate.SemanticBrake")({
  windowTurns: Schema.Number.pipe(Schema.optional).annotate({
    description: "Number of prior turns to check for repetition",
  }),
  killAt: Schema.Number.pipe(Schema.optional).annotate({
    description: "Jaccard similarity threshold for KILL decision (0-1)",
  }),
  detectors: Schema.Array(Schema.String).pipe(Schema.optional).annotate({
    description: "Enabled detectors: semantic, action, ngram, edit, compression",
  }),
}) {}

export class ColdTool extends Schema.Class<ColdTool>("ConfigGate.ColdTool")({
  lookbackTurns: Schema.Number.pipe(Schema.optional).annotate({
    description: "Turns to look back for cold-tool re-rank",
  }),
  maxCandidates: Schema.Number.pipe(Schema.optional).annotate({
    description: "Maximum cold-tool candidates to surface",
  }),
}) {}

export class Info extends Schema.Class<Info>("ConfigGate.Info")({
  proseTokenBudget: Schema.Number.pipe(Schema.optional).annotate({
    description: "Maximum prose tokens before forcing RaceTuple",
  }),
  pivotBudget: Schema.Number.pipe(Schema.optional).annotate({
    description: "Maximum pivot phrases before forcing RaceTuple",
  }),
  repetitionJaccard: Schema.Number.pipe(Schema.optional).annotate({
    description: "Jaccard threshold for semantic brake (0-1)",
  }),
  raceSeconds: Schema.Number.pipe(Schema.optional).annotate({
    description: "Timeout for race-run.sh in seconds",
  }),
  narration: Narration.pipe(Schema.optional).annotate({
    description: "Run-scoped narration guard configuration",
  }),
  semanticBrake: SemanticBrake.pipe(Schema.optional).annotate({
    description: "5-detector semantic brake configuration",
  }),
  coldTool: ColdTool.pipe(Schema.optional).annotate({
    description: "Cold-tool re-rank configuration",
  }),
}) {}