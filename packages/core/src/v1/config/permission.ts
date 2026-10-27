export * as ConfigPermissionV1 from "./permission"

import { Schema, SchemaGetter } from "effect"

export const Action = Schema.NullOr(Schema.Literals(["ask", "allow", "deny"])) // kappacode_change - nullable allows null as a delete sentinel
  .annotate({ identifier: "PermissionActionConfig" })
export type Action = Schema.Schema.Type<typeof Action>

export const Object = Schema.Record(Schema.String, Action).annotate({ identifier: "PermissionObjectConfig" })
export type Object = Schema.Schema.Type<typeof Object>

export const Rule = Schema.Union([Action, Object]).annotate({ identifier: "PermissionRuleConfig" })
export type Rule = Schema.Schema.Type<typeof Rule>

// Known permission keys get explicit types in the Effect schema for generated
// kilocode_change start
// docs/types. The decode path uses a Record (see below) because permission
// precedence is order-sensitive and struct decode follows schema order.
// kilocode_change end
const InputObject = Schema.StructWithRest(
  Schema.Struct({
    read: Schema.optional(Rule),
    edit: Schema.optional(Rule),
    glob: Schema.optional(Rule),
    grep: Schema.optional(Rule),
    list: Schema.optional(Rule),
    bash: Schema.optional(Rule),
    task: Schema.optional(Rule),
    external_directory: Schema.optional(Rule),
    markdown_source: Schema.optional(Rule), // kappacode_change - explicitly authorize external agent/command sources
    todowrite: Schema.optional(Action),
    question: Schema.optional(Action),
    webfetch: Schema.optional(Action),
    websearch: Schema.optional(Action),
    lsp: Schema.optional(Rule),
    doom_loop: Schema.optional(Action),
    skill: Schema.optional(Rule),
    agent_manager: Schema.optional(Rule), // kappacode_change
    // kappacode_change start
    notebook_read: Schema.optional(Rule),
    notebook_edit: Schema.optional(Rule),
    notebook_execute: Schema.optional(Rule),
    // kappacode_change end
  }),
  [Schema.Record(Schema.String, Rule)],
)

// kilocode_change start
// Effect 4 removed the `propertyOrder: "original"` parse option, so a struct
// decode reorders permission keys into schema order — breaking precedence,
// which is order-sensitive. Decode through a Record (input key order
// preserved end to end, including through decodeTo) and keep the struct
// below as the documented type for known keys.
const InputRecord = Schema.Record(Schema.String, Rule)
const InputSchema = Schema.Union([Action, InputRecord])

const normalizeInput = (input: Schema.Schema.Type<typeof InputSchema>): Schema.Schema.Type<typeof InputRecord> =>
  input === null || typeof input === "string" ? { "*": input } : input // kappacode_change

export const Info = InputSchema.pipe(
  Schema.decodeTo(InputRecord, {
    decode: SchemaGetter.transform(normalizeInput),
    encode: SchemaGetter.passthrough({ strict: false }),
  }),
).annotate({ identifier: "PermissionConfig" })
// kilocode_change end
type _Info = Schema.Schema.Type<typeof InputObject>
export type Info = { -readonly [K in keyof _Info]: _Info[K] }
