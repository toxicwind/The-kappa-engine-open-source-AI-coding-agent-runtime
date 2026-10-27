import { Effect, Option, Schema, SchemaAST } from "effect"
import z from "zod"

/**
 * Annotation key for providing a hand-crafted Zod schema that the walker
 * should use instead of re-deriving from the AST.  Attach it via
 * `Schema.String.annotate({ [ZodOverride]: z.string().startsWith("per") })`.
 */
export const ZodOverride: unique symbol = Symbol.for("effect-zod/override")

// AST nodes are immutable and frequently shared across schemas (e.g. a single
// Schema.Class embedded in multiple parents). Memoizing by node identity
// avoids rebuilding equivalent Zod subtrees and keeps derived children stable
// by reference across callers.
const walkCache = new WeakMap<SchemaAST.AST, z.ZodTypeAny>()

// Shared empty ParseOptions for the rare callers that need one — avoids
// allocating a fresh object per parse inside refinements and transforms.
const EMPTY_PARSE_OPTIONS = {} as SchemaAST.ParseOptions

export function zod<S extends Schema.Top>(schema: S): z.ZodType<Schema.Schema.Type<S>> {
  return walk(schema.ast) as z.ZodType<Schema.Schema.Type<S>>
}

/**
 * Derive a Zod value from an Effect Schema (or a Schema-backed export with a
 * `.zod` static) and narrow the result to `z.ZodObject<any>` so `.shape`,
 * `.omit`, `.extend`, and friends are accessible.
 *
 * The `zod()` walker returns `z.ZodType<T>` because not every AST node decodes
 * to an object; this helper keeps the "I started from a `Schema.Struct`" cast
 * in one place instead of sprinkling `as unknown as z.ZodObject<any>` across
 * call sites.
 *
 * The return is intentionally loose — carrying Schema field types through the
 * mapped `.omit()` / `.extend()` surface triggers brand-intersection
 * explosions for branded primitives (`string & Brand<"SessionID">` extends
 * `object` via the brand and gets walked into the prototype by `DeepPartial`,
 * `updateSchema`, etc.), and zod's inference through `z.ZodType<T | undefined>`
 * wrappers also can't reconstruct `T` cleanly. Consumers that care about the
 * post-`.omit()` shape should cast `c.req.valid(...)` to the expected type.
 */
export function zodObject<S extends Schema.Top>(schema: S): z.ZodObject<any> {
  const derived: z.ZodTypeAny = "zod" in schema && isZodType(schema.zod) ? schema.zod : walk(schema.ast)
  return derived as unknown as z.ZodObject<any>
}

function isZodType(value: unknown): value is z.ZodTypeAny {
  return typeof value === "object" && value !== null && "_zod" in value
}

/**
 * Emit a JSON Schema for a tool/route parameter schema — derives the zod form
 * via the walker so Effect Schema inputs flow through the same zod-openapi
 * pipeline the LLM/SDK layer already depends on.  `io: "input"` mirrors what
 * `session/prompt.ts` has always passed to `ai`'s `jsonSchema()` helper.
 */
export function toJsonSchema<S extends Schema.Top>(schema: S) {
  return z.toJSONSchema(zod(schema), { io: "input" })
}

function walk(ast: SchemaAST.AST): z.ZodTypeAny {
  const cached = walkCache.get(ast)
  if (cached) return cached
  const result = walkUncached(ast)
  walkCache.set(ast, result)
  return result
}

function walkUncached(ast: SchemaAST.AST): z.ZodTypeAny {
  const override = (ast.annotations as any)?.[ZodOverride] as z.ZodTypeAny | undefined
  // `description` annotations layer on top of an override so callers can
  // reuse a shared override schema (e.g. `SessionID`) and still add a
  // per-field description on the outer wrapper.
  const base = override ?? bodyWithChecks(ast)
  const desc = SchemaAST.resolveDescription(ast)
  const ref = SchemaAST.resolveIdentifier(ast)
  const described = desc ? base.describe(desc) : base
  return ref ? described.meta({ ref }) : described
}

function bodyWithChecks(ast: SchemaAST.AST): z.ZodTypeAny {
  // Schema.Class wraps its fields in a Declaration AST plus an encoding that
  // constructs the class instance. For the Zod derivation we want the plain
  // field shape (the decoded/consumer view), not the class instance — so
  // Declarations fall through to body(), not encoded(). User-level
  // Schema.decodeTo / Schema.transform attach encoding to non-Declaration
  // nodes, where we do apply the transform.
  //
  // Schema.withDecodingDefault also attaches encoding, but we want `.default(v)`
  // on the inner Zod rather than a transform wrapper — so optional ASTs whose
  // encoding resolves a default from Option.none() route through body()/opt().
  const hasEncoding = ast.encoding?.length && (ast._tag !== "Declaration" || ast.typeParameters.length === 0)
  const hasTransform = hasEncoding && !(SchemaAST.isOptional(ast) && extractDefault(ast) !== undefined)
  const base = hasTransform ? encoded(ast) : body(ast)
  return ast.checks?.length ? applyChecks(base, ast.checks, ast) : base
}

// Walk the encoded side and apply each link's decode to produce the decoded
// shape. A node `Target` produced by `from.decodeTo(Target)` carries
// `Target.encoding = [Link(from, transformation)]`. Chained decodeTo calls
// nest the encoding via `Link.to` so walking it recursively threads all
// prior transforms — typical encoding.length is 1.
function encoded(ast: SchemaAST.AST): z.ZodTypeAny {
  const encoding = ast.encoding!
  return encoding.reduce<z.ZodTypeAny>(
    (acc, link) => acc.transform((v) => decode(link.transformation, v)),
    walk(encoding[0].to),
  )
}

// kilocode_change start
// Transformations built via pure `SchemaGetter.transform(fn)` (the common
// decodeTo case) resolve synchronously, so running with no services is safe.
// Effectful / middleware-based transforms will surface as Effect defects.
// Effect 4 getters expose `transform(value, options)` taking the raw value
// (the Effect 3 `.run` entry point took an Option and is gone), and sync
// getters return the decoded value directly while effectful ones return an
// Effect — so resolve either shape, unwrapping Options when present.
function decode(transformation: SchemaAST.Link["transformation"], value: unknown): unknown {
  const getter = transformation.decode as {
    readonly run?: (input: Option.Option<unknown>, options: SchemaAST.ParseOptions) => Effect.Effect<Option.Option<unknown>>
    readonly transform?: (input: unknown, options: SchemaAST.ParseOptions) => unknown
  }
  const unwrap = (resolved: unknown) => (Option.isOption(resolved) ? Option.getOrElse(resolved, () => value) : resolved)
  if (typeof getter.transform === "function") {
    const result = getter.transform(value, EMPTY_PARSE_OPTIONS)
    if (Effect.isEffect(result)) {
      const exit = Effect.runSyncExit(result as Effect.Effect<unknown>)
      if (exit._tag === "Failure") throw new Error(`effect-zod: transform failed: ${String(exit.cause)}`)
      return unwrap(exit.value)
    }
    return unwrap(result)
  }
  const exit = Effect.runSyncExit(getter.run!(Option.some(value), EMPTY_PARSE_OPTIONS))
  if (exit._tag === "Failure") throw new Error(`effect-zod: transform failed: ${String(exit.cause)}`)
  return unwrap(exit.value)
}
// kilocode_change end

// Flatten FilterGroups and any nested variants into a linear list of Filters.
// Well-known filters (Schema.isInt, isGreaterThan, isPattern, …) are
// translated into native Zod methods so their JSON Schema output includes
// the corresponding constraint (type: integer, exclusiveMinimum, pattern, …).
// Anything else falls back to a single .superRefine layer — runtime-only,
// emits no JSON Schema constraint.
function applyChecks(out: z.ZodTypeAny, checks: SchemaAST.Checks, ast: SchemaAST.AST): z.ZodTypeAny {
  const filters: SchemaAST.Filter<unknown>[] = []
  const collect = (c: SchemaAST.Check<unknown>) => {
    if (c._tag === "FilterGroup") c.checks.forEach(collect)
    else filters.push(c)
  }
  checks.forEach(collect)

  const unhandled: SchemaAST.Filter<unknown>[] = []
  const translated = filters.reduce<z.ZodTypeAny>((acc, filter) => {
    const next = translateFilter(acc, filter)
    if (next) return next
    unhandled.push(filter)
    return acc
  }, out)

  if (unhandled.length === 0) return translated

  return translated.superRefine((value, ctx) => {
    for (const filter of unhandled) {
      const issue = filter.run(value, ast, EMPTY_PARSE_OPTIONS)
      if (!issue) continue
      const message = issueMessage(issue) ?? (filter.annotations as any)?.message ?? "Validation failed"
      ctx.addIssue({ code: "custom", message })
    }
  })
}

// kilocode_change start
// Translate a well-known Effect Schema filter into a native Zod method call on
// `out`. Dispatch is keyed on the Effect 4 filter `representation` annotation
// (`{ id: "effect/schema/<name>", payload }`), which every built-in check
// factory (isInt, isGreaterThan, isPattern, …) attaches at construction time.
// Returns `undefined` for unrecognised filters so the caller can fall back to
// the generic .superRefine path.
function translateFilter(out: z.ZodTypeAny, filter: SchemaAST.Filter<unknown>): z.ZodTypeAny | undefined {
  const representation = (filter.annotations as { representation?: { id?: unknown; payload?: unknown } } | undefined)
    ?.representation
  if (!representation || typeof representation.id !== "string") return undefined
  const payload = (representation.payload ?? {}) as Record<string, unknown>
  const num = (key: string): number | undefined =>
    typeof payload[key] === "number" ? (payload[key] as number) : undefined
  const str = (key: string): string | undefined =>
    typeof payload[key] === "string" ? (payload[key] as string) : undefined
  // Missing payload values fall back to superRefine instead of calling a Zod
  // method with undefined.
  const callValue = (method: string, value: unknown) => (value === undefined ? undefined : call(out, method, value))
  switch (representation.id) {
    case "effect/schema/isInt":
      return call(out, "int")
    case "effect/schema/isFinite":
      return call(out, "finite")
    case "effect/schema/isGreaterThan":
      return callValue("gt", num("exclusiveMinimum"))
    case "effect/schema/isGreaterThanOrEqualTo":
      return callValue("gte", num("minimum"))
    case "effect/schema/isLessThan":
      return callValue("lt", num("exclusiveMaximum"))
    case "effect/schema/isLessThanOrEqualTo":
      return callValue("lte", num("maximum"))
    case "effect/schema/isBetween": {
      const minimum = num("minimum")
      const maximum = num("maximum")
      if (minimum === undefined || maximum === undefined) return undefined
      const lo = payload.exclusiveMinimum ? call(out, "gt", minimum) : call(out, "gte", minimum)
      if (!lo) return undefined
      return payload.exclusiveMaximum ? call(lo, "lt", maximum) : call(lo, "lte", maximum)
    }
    case "effect/schema/isMultipleOf":
      return callValue("multipleOf", num("divisor"))
    case "effect/schema/isMinLength":
      return callValue("min", num("minLength"))
    case "effect/schema/isMaxLength":
      return callValue("max", num("maxLength"))
    case "effect/schema/isPattern": {
      const source = str("source")
      if (source === undefined) return undefined
      return call(out, "regex", new RegExp(source, str("flags") ?? ""))
    }
    case "effect/schema/isStartingWith":
      return callValue("startsWith", str("startsWith"))
    case "effect/schema/isEndingWith":
      return callValue("endsWith", str("endsWith"))
    case "effect/schema/isUUID":
      return call(out, "uuid")
    case "effect/schema/isULID":
      return call(out, "ulid")
    case "effect/schema/isBase64":
      return call(out, "base64")
    case "effect/schema/isBase64Url":
      return call(out, "base64url")
  }
  return undefined
}
// kilocode_change end

// Invoke a named Zod method on `target` if it exists, otherwise return
// undefined so the caller can fall back. Using this helper instead of a
// typed cast keeps `translateFilter` free of per-case narrowing noise.
function call(target: z.ZodTypeAny, method: string, ...args: unknown[]): z.ZodTypeAny | undefined {
  const fn = (target as unknown as Record<string, ((...a: unknown[]) => z.ZodTypeAny) | undefined>)[method]
  return typeof fn === "function" ? fn.apply(target, args) : undefined
}

function issueMessage(issue: any): string | undefined {
  if (typeof issue?.annotations?.message === "string") return issue.annotations.message
  if (typeof issue?.message === "string") return issue.message
  return undefined
}

function body(ast: SchemaAST.AST): z.ZodTypeAny {
  if (SchemaAST.isOptional(ast) && ast._tag === "Union") return opt(ast)

  switch (ast._tag) {
    case "String":
      return z.string()
    case "Number":
      return z.number()
    case "Boolean":
      return z.boolean()
    case "Null":
      return z.null()
    case "Undefined":
      return z.undefined()
    case "Any":
    case "Unknown":
      return z.unknown()
    case "Never":
      return z.never()
    case "Literal":
      return z.literal(ast.literal)
    case "Union":
      return union(ast)
    case "Objects":
      return object(ast)
    case "Arrays":
      return array(ast)
    case "Declaration":
      return decl(ast)
    default:
      return fail(ast)
  }
}

function opt(ast: SchemaAST.AST): z.ZodTypeAny {
  if (ast._tag !== "Union") return fail(ast)
  const items = ast.types.filter((item) => item._tag !== "Undefined")
  const inner =
    items.length === 1
      ? walk(items[0])
      : items.length > 1
        ? z.union(items.map(walk) as [z.ZodTypeAny, z.ZodTypeAny, ...Array<z.ZodTypeAny>])
        : z.undefined()
  // Schema.withDecodingDefault attaches an encoding `Link` whose transformation
  // decode Getter resolves `Option.none()` to `Option.some(default)`.  Invoke
  // it to extract the default and emit `.default(...)` instead of `.optional()`.
  const fallback = extractDefault(ast)
  if (fallback !== undefined) return inner.default(fallback.value)
  return inner.optional()
}

type DecodeLink = {
  readonly transformation: {
    // effect 4 (kappacode): the decode node is a tagged transformation whose
    // runner differs by `_tag`. `TransformOptionalEffect`, `TransformEffect`
    // and friends expose a unary `transform(input) => Effect`. Guard on its
    // presence rather than assuming `.run` (effect 3) or a fixed `_tag`.
    readonly decode: {
      readonly _tag?: string
      readonly transform?: (input: Option.Option<unknown>) => Effect.Effect<Option.Option<unknown>, unknown>
    }
  }
}

function extractDefault(ast: SchemaAST.AST): { value: unknown } | undefined {
  const encoding = (ast as { encoding?: ReadonlyArray<DecodeLink> }).encoding
  if (!encoding?.length) return undefined
  // Walk the chain of encoding Links in order; the first Getter that produces
  // a value from Option.none wins.  withDecodingDefault always puts its
  // defaulting Link adjacent to the optional Union.
  for (const link of encoding) {
    const decode = link.transformation.decode
    if (typeof decode.transform !== "function") continue
    const probe = Effect.runSyncExit(decode.transform(Option.none()))
    if (probe._tag !== "Success") continue
    if (Option.isSome(probe.value)) return { value: probe.value.value }
  }
  return undefined
}

function union(ast: SchemaAST.Union): z.ZodTypeAny {
  // When every member is a string literal, emit z.enum() so that
  // JSON Schema produces { "enum": [...] } instead of { "anyOf": [{ "const": ... }] }.
  if (ast.types.length >= 2 && ast.types.every((t) => t._tag === "Literal" && typeof t.literal === "string")) {
    return z.enum(ast.types.map((t) => (t as SchemaAST.Literal).literal as string) as [string, ...string[]])
  }

  const items = ast.types.map(walk)
  if (items.length === 1) return items[0]
  if (items.length < 2) return fail(ast)

  const discriminator = ast.annotations?.discriminator
  if (typeof discriminator === "string") {
    return z.discriminatedUnion(discriminator, items as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]])
  }

  return z.union(items as [z.ZodTypeAny, z.ZodTypeAny, ...Array<z.ZodTypeAny>])
}

function object(ast: SchemaAST.Objects): z.ZodTypeAny {
  // Pure record: { [k: string]: V }
  if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 1) {
    const sig = ast.indexSignatures[0]
    if (sig.parameter._tag !== "String") return fail(ast)
    return z.record(z.string(), walk(sig.type))
  }

  // Pure object with known fields and no index signatures.
  if (ast.indexSignatures.length === 0) {
    return z.object(Object.fromEntries(ast.propertySignatures.map((sig) => [String(sig.name), walk(sig.type)])))
  }

  // Struct with a catchall (StructWithRest): known fields + index signature.
  // Only supports a single string-keyed index signature; multi-signature or
  // symbol/number keys fall through to fail.
  if (ast.indexSignatures.length !== 1) return fail(ast)
  const sig = ast.indexSignatures[0]
  if (sig.parameter._tag !== "String") return fail(ast)
  return z
    .object(Object.fromEntries(ast.propertySignatures.map((p) => [String(p.name), walk(p.type)])))
    .catchall(walk(sig.type))
}

function array(ast: SchemaAST.Arrays): z.ZodTypeAny {
  // Pure variadic arrays: { elements: [], rest: [item] }
  if (ast.elements.length === 0) {
    if (ast.rest.length !== 1) return fail(ast)
    return z.array(walk(ast.rest[0]))
  }
  // Fixed-length tuples: { elements: [a, b, ...], rest: [] }
  // Tuples with a variadic tail (...rest) are not yet supported.
  if (ast.rest.length > 0) return fail(ast)
  const items = ast.elements.map(walk)
  return z.tuple(items as [z.ZodTypeAny, ...Array<z.ZodTypeAny>])
}

function decl(ast: SchemaAST.Declaration): z.ZodTypeAny {
  if (ast.typeParameters.length !== 1) return fail(ast)
  return walk(ast.typeParameters[0])
}

function fail(ast: SchemaAST.AST): never {
  const ref = SchemaAST.resolveIdentifier(ast)
  throw new Error(`unsupported effect schema: ${ref ?? ast._tag}`)
}
