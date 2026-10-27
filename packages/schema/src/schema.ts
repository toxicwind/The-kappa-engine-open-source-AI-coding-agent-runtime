import { DateTime, Option, Schema, SchemaGetter } from "effect"

export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
    }),
  )

export const statics = <S extends object, M extends Record<string, unknown>>(methods: (schema: S) => M) => {
  // effect 4.0.6: schema prototypes expose a non-writable `make` (and other
  // methods). The legacy `Object.assign(schema, methods(schema))` breaks when a
  // statics key shadows one of those (ECMAScript forbids defining an own prop
  // that overrides a non-writable inherited accessor -> "Attempted to assign to
  // readonly property", observed under bun 1.4.x). Wrap the schema in a Proxy
  // that serves the attached statics first and forwards everything else to the
  // schema, so members like `make`/`parse`/`type`/`data` are overridable without
  // mutating (or losing identity of) the frozen-ish schema value.
  // kilocode_change start - never shadow `make` (or any getter-memoized schema
  // method) here: Effect 4 memoizes schema.make as a non-configurable own
  // property on first read, so a proxy trap returning a different `make`
  // throws a Proxy get-invariant TypeError under bun (first read when bound,
  // second read otherwise). Constructors that need the original make live
  // outside the proxy as plain functions (see makeSessionsCursor).
  // kilocode_change end
  const cache = new WeakMap<object, M>()
  const resolved = (schema: S): M => {
    let m = cache.get(schema)
    if (!m) {
      m = methods(schema)
      cache.set(schema, m)
    }
    return m
  }
  return (schema: S): S & M => {
    const m = resolved(schema)
    const proxy = new Proxy<S>(schema, {
      get(target, prop, receiver) {
        if (prop in m) return (m as Record<PropertyKey, unknown>)[prop]
        return Reflect.get(target, prop, receiver)
      },
      has(target, prop) {
        return prop in m || Reflect.has(target, prop)
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop in m) {
          const value = (m as Record<PropertyKey, unknown>)[prop]
          return { value, writable: true, enumerable: true, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      },
      ownKeys(target) {
        return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(m)])]
      },
    })
    return proxy as S & M
  }
}

export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
