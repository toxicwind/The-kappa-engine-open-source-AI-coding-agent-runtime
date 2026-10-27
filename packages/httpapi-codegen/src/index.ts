import { isAbsolute, join } from "node:path"
import { Effect, FileSystem, PlatformError, Schema, SchemaAST, SchemaRepresentation } from "effect"
import { HttpMethod, type HttpRouter } from "effect/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { format } from "prettier"

export type InputField = {
  readonly name: string
  readonly source: "params" | "query" | "headers" | "payload"
}

export type Operation = {
  readonly group: string
  readonly name: string
  readonly input: ReadonlyArray<InputField>
  readonly inputMode: "none" | "optional" | "required"
  readonly success: "value" | "void" | "stream"
  readonly errors: ReadonlyArray<string>
}

export type Output = {
  readonly operations: ReadonlyArray<Operation>
  readonly files: ReadonlyArray<{
    readonly path: string
    readonly content: string
  }>
}

export type Contract = {
  readonly groups: ReadonlyArray<Group>
}

export class GenerationError extends Schema.TaggedError<GenerationError>()("GenerationError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export type Endpoint = {
  readonly group: string
  readonly sourceGroup: string
  readonly topLevel: boolean
  readonly endpoint: HttpApiEndpoint.Top
  readonly params: Schema.Top | undefined
  readonly query: Schema.Top | undefined
  readonly headers: Schema.Top | undefined
  readonly payloads: ReadonlyArray<Schema.Top>
  readonly operation: Operation
  readonly input: ReadonlyArray<InputField & { readonly optional: boolean }>
  readonly unwrapData: boolean
  readonly errors: ReadonlyArray<{ readonly status: number; readonly schema: Schema.Top }>
  readonly successes: ReadonlyArray<Schema.Top>
  readonly effectPortable: boolean
}

export type Group = {
  readonly identifier: string
  readonly sourceIdentifier: string
  readonly module: string
  readonly endpoints: ReadonlyArray<Endpoint>
}

type Slot = {
  readonly name: string
  readonly schema: Schema.Constraint
}

const resolveAnnotation = <A>(key: string) => (ast: SchemaAST.AST): A | undefined => {
  const direct = SchemaAST.resolveAt<A>(key)(ast)
  if (direct !== undefined) return direct
  // Effect 4 attaches HttpApi annotations to the node's context instead of
  // its annotation map; read both so statuses survive decoding.
  return contextAnnotation(ast, key) as A | undefined
}
const contextAnnotation = (ast: SchemaAST.AST, key: string): unknown =>
  (ast.context?.annotations as Record<string, unknown> | undefined)?.[key]
const resolveHttpApiStatus = resolveAnnotation<number>("httpApiStatus")
const resolveHttpApiEncoding = resolveAnnotation<HttpApiSchema.Encoding>("~httpApiEncoding")
const resolveContentSchema = SchemaAST.resolveAt<SchemaAST.AST>("contentSchema")
const Manifest = Schema.fromJsonString(Schema.Array(Schema.String))
const manifestName = ".httpapi-codegen.json"

export function compile<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
  const endpoints: Array<Endpoint> = []
  const portable = new Map<SchemaAST.AST, boolean>()

  HttpApi.reflect(api, {
    onGroup() {},
    onEndpoint({ endpoint, errors, group, middleware }) {
      if (options?.omitEndpoints?.has(endpoint.identifier)) return
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.identifier}`
      const required = Array.from(middleware).find((item) => item.requiredForClient)
      if (required !== undefined) {
        throw new GenerationError({ reason: `Client middleware requires adapter: ${required.key}` })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1) throw new GenerationError({ reason: `Multiple success schemas: ${name}` })

      const params = normalizeTransport(endpoint.params, "params", endpoint, name)
      const query = normalizeTransport(endpoint.query, "query", endpoint, name)
      const headers = normalizeTransport(endpoint.headers, "headers", endpoint, name)
      const sourcePayloads = Array.from(endpoint.payload.values()).flatMap(({ schemas }) => schemas)
      if (sourcePayloads.length > 1) {
        throw new GenerationError({ reason: `Multiple payload schemas: ${name}` })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({ status, ...normalizeTransport(schema, "error", endpoint, name)! })),
      )
      errorSchemas.sort((a, b) => {
        const left = SchemaAST.resolveIdentifier(a.schema.ast) ?? ""
        const right = SchemaAST.resolveIdentifier(b.schema.ast) ?? ""
        return a.status - b.status || (left < right ? -1 : left > right ? 1 : 0)
      })
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name)) throw new GenerationError({ reason: `Input field collision: ${field.name}` })
        names.add(field.name)
      }

      const schemaPaths: Array<readonly [string, Schema.Constraint]> = [
        ...(params === undefined ? [] : [[`${name}.params`, params.schema] as const]),
        ...(query === undefined ? [] : [[`${name}.query`, query.schema] as const]),
        ...(headers === undefined ? [] : [[`${name}.headers`, headers.schema] as const]),
        ...payloads.map((item) => [`${name}.payload`, item.schema] as const),
        ...responseSchemas(success.schema, `${name}.success`),
        ...errorSchemas.map((item) => [`${name}.error.${item.status}`, item.schema] as const),
      ]
      const effectPortable =
        [params, query, headers, ...payloads, success, ...errorSchemas].every(
          (item) => item?.effectPortable !== false,
        ) && streamEffectPortable(success.schema)
      if (effectPortable) {
        for (const [path, schema] of schemaPaths) assertPortable(schema, path, portable)
      }

      endpoints.push({
        group: groupName,
        sourceGroup: group.identifier,
        topLevel: group.topLevel,
        endpoint,
        params: params?.schema,
        query: query?.schema,
        headers: headers?.schema,
        payloads: payloads.map((item) => item.schema),
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.identifier] ?? clientEndpointName(endpoint.identifier),
          input: inputs.map(({ name, source }) => ({ name, source })),
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
              : "value",
          errors: [
            ...new Set([
              ...errorSchemas.flatMap((item) => {
                const identifier = SchemaAST.resolveIdentifier(item.schema.ast)
                return identifier === undefined ? [] : [identifier]
              }),
              "ClientError",
            ]),
          ],
        },
      })
    },
  })

  const modules = new Set(["client", "client-error", "index"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      return { identifier, sourceIdentifier: endpoints[0].sourceGroup, module, endpoints }
    },
  )
  const publicNames = new Set<string>()
  for (const group of groups) {
    const endpointNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      if (endpointNames.has(endpoint.operation.name)) {
        throw new GenerationError({
          reason: `Client endpoint name collision: ${group.identifier}.${endpoint.operation.name}`,
        })
      }
      endpointNames.add(endpoint.operation.name)
    }
    const names = group.endpoints[0]?.topLevel ? group.endpoints.map((item) => item.operation.name) : [group.identifier]
    for (const name of names) {
      if (publicNames.has(name)) throw new GenerationError({ reason: `Client name collision: ${name}` })
      publicNames.add(name)
    }
  }
  return {
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
      reason: `Effect schema requires authoritative import: ${endpoint.group}.${endpoint.endpoint.identifier}`,
    })
  }
  return { operations: operations(contract.groups), files: renderEffectFiles(contract.groups) }
}

export function emitEffectImported(
  contract: Contract,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | { readonly module: string; readonly endpoints: Readonly<Record<string, string>> },
): Output {
  return {
    operations: operations(contract.groups),
    files: renderImportedEffectFiles(contract.groups, options),
  }
}

export function emitPromise(
  contract: Contract,
  options?: {
    readonly outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>
  },
): Output {
  const groups = contract.groups
  for (const group of groups) {
    for (const endpoint of group.endpoints) assertPromiseEndpoint(endpoint)
  }
  return {
    operations: operations(groups),
    files: [
      { path: "types.ts", content: renderPromiseTypes(groups, options?.outputTypes) },
      {
        path: "client-error.ts",
        content: `export type ClientErrorReason = "Transport" | "UnexpectedStatus" | "UnsupportedContentType" | "MalformedResponse"\n\nexport class ClientError extends Error {\n  override readonly name = "ClientError"\n  constructor(readonly reason: ClientErrorReason, options?: ErrorOptions) {\n    super(reason, options)\n  }\n}\n`,
      },
      {
        path: "client.ts",
        content: renderPromiseClient(groups).replace("let next: ReadableStreamReadResult<Uint8Array>", "let next"),
      },
      {
        path: "index.ts",
        content:
          'export { ClientError, type ClientErrorReason } from "./client-error"\nexport * as OpenCode from "./client"\nexport * from "./types"\n',
      },
    ],
  }
}

function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.identifier}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise payload encoding: ${name}` })
  }
  const success = endpoint.successes[0]
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({ reason: `Unsupported Promise stream: ${name}` })
    }
  } else if (
    !HttpApiSchema.isNoContent(success.ast) &&
    (resolveHttpApiEncoding(success.ast)?._tag ?? "Json") !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
  }
  for (const error of endpoint.errors) {
    if (declaredErrorFields(error.schema) === undefined) {
      throw new GenerationError({ reason: `Promise error must have a literal discriminator: ${name}` })
    }
    if ((resolveHttpApiEncoding(error.schema.ast)?._tag ?? "Json") !== "Json") {
      throw new GenerationError({ reason: `Unsupported Promise error encoding: ${name}` })
    }
  }
}

function operations(groups: ReadonlyArray<Group>) {
  return groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.operation))
}

function renderEffectFiles(groups: ReadonlyArray<Group>): Output["files"] {
  return [
    ...groups.map((group, index) => ({ path: `${group.module}.ts`, content: renderGroup(group, index) })),
    {
      path: "client-error.ts",
      content:
        'import { Schema } from "effect"\n\nexport class ClientError extends Schema.TaggedError<ClientError>()("ClientError", {\n  cause: Schema.Defect(),\n}) {}\n',
    },
    { path: "client.ts", content: renderClient(groups) },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as OpenCode from "./client"\n',
    },
  ]
}

function renderImportedEffectFiles(
  groups: ReadonlyArray<Group>,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | { readonly module: string; readonly endpoints: Readonly<Record<string, string>> },
): Output["files"] {
  const adapters = groups.map((group, groupIndex) => {
    const rawGroup = group.endpoints[0]?.topLevel ? "RawClient" : `RawClient[${JSON.stringify(group.sourceIdentifier)}]`
    const methods = group.endpoints.map((item, endpointIndex) => {
      const prefix = `Endpoint${groupIndex}_${endpointIndex}`
      const request = (["params", "query", "headers", "payload"] as const)
        .flatMap((source) => {
          const fields = item.input.filter((field) => field.source === source)
          if (fields.length === 0) return []
          return [
            `${source}: { ${fields.map((field) => `${JSON.stringify(field.name)}: input${item.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(field.name)}]`).join(", ")} }`,
          ]
        })
        .join(", ")
      const input = item.input
        .map(
          (field) =>
            `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${prefix}Request[${JSON.stringify(field.source)}][${JSON.stringify(field.name)}]`,
        )
        .join("; ")
      const argument =
        item.operation.inputMode === "none"
          ? ""
          : `input${item.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
      const rawCall = `raw[${JSON.stringify(item.endpoint.identifier)}]({ ${request} })`
      const mapped = `${rawCall}.pipe(Effect.mapError(mapClientError)${item.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
      return `${item.operation.inputMode === "none" ? "" : `type ${prefix}Request = Parameters<${rawGroup}[${JSON.stringify(item.endpoint.identifier)}]>[0]\ntype ${prefix}Input = { ${input} }\n`}const ${prefix} = (raw: ${rawGroup}) => (${argument}) => ${item.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(mapClientError), Effect.map((stream) => stream.pipe(Stream.mapError(mapClientError)))))` : mapped}`
    })
    return `${methods.join("\n\n")}\n\nconst adaptGroup${groupIndex} = (raw: ${rawGroup}) => ({ ${group.endpoints.map((item, endpointIndex) => `${JSON.stringify(item.operation.name)}: Endpoint${groupIndex}_${endpointIndex}(raw)`).join(", ")} })`
  })
  const fields = groups.flatMap((group, index) =>
    group.endpoints[0]?.topLevel
      ? [`...adaptGroup${index}(raw)`]
      : [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.sourceIdentifier)}])`],
  )
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const imported = "api" in options
  const projection = imported
    ? undefined
    : "group" in options
      ? renderImportedGroup(options.group)
      : renderImportedProjection(groups, options.endpoints)
  const api = imported ? options.api : "Api"
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/http-api"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/http-api"\n' : ""
  const client = `// Generated by @opencode-ai/httpapi-codegen. Do not edit.\nimport { Effect${usesStream ? ", Stream" : ""}, Schema } from "effect"\nimport { Sse } from "effect/encoding"\nimport { HttpClientError } from "effect/http"\n${httpApiImport}${imports}\nimport { ClientError } from "./client-error"\n\n${projection?.source ?? ""}type RawClient = HttpApiClient.ForApi<typeof ${api}>\n\nconst mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error\n\n${adapters.join("\n\n")}\n\nconst adaptClient = (raw: RawClient) => ({ ${fields.join(", ")} })\n\nexport const make = (options?: { readonly baseUrl?: URL | string }) => HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))\n`
  return [
    {
      path: "client-error.ts",
      content:
        'import { Schema } from "effect"\n\nexport class ClientError extends Schema.TaggedError<ClientError>()("ClientError", {\n  cause: Schema.Defect(),\n}) {}\n',
    },
    { path: "client.ts", content: client },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as OpenCode from "./client"\n',
    },
  ]
}

function renderImportedGroup(group: string) {
  return {
    imports: [group],
    source: `const Api = HttpApi.make("generated").add(${group})\n\n`,
  }
}

function renderImportedProjection(groups: ReadonlyArray<Group>, endpoints: Readonly<Record<string, string>>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.map((endpoint) => {
      const name = endpoints[`${group.identifier}.${endpoint.endpoint.identifier}`]
      if (name === undefined) {
        throw new GenerationError({
          reason: `Missing imported endpoint: ${group.identifier}.${endpoint.endpoint.identifier}`,
        })
      }
      return name
    }),
  )
  const source = `const Api = HttpApi.make("generated").${groups
    .map((group) => {
      const options = group.endpoints[0]?.topLevel ? ", { topLevel: true }" : ""
      return `add(HttpApiGroup.make(${JSON.stringify(group.identifier)}${options})${group.endpoints.map((endpoint) => `.add(${endpoints[`${group.identifier}.${endpoint.endpoint.identifier}`]})`).join("")})`
    })
    .join(".")}\n\n`
  return { imports: [...new Set(imports)], source }
}

function renderPromiseTypes(
  groups: ReadonlyArray<Group>,
  outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>,
) {
  const types = new Map<SchemaAST.AST, string>()
  const typeOf = (schema: Schema.Constraint, decoded = false) => {
    const projected = decoded ? Schema.toType(schema) : Schema.toEncoded(schema)
    const cached = types.get(projected.ast)
    if (cached !== undefined) return cached
    const type = structuralType(projected)
    types.set(projected.ast, type)
    return type
  }
  const errors = new Map(
    groups.flatMap((group) =>
      group.endpoints.flatMap((endpoint) =>
        endpoint.errors.flatMap((error) => {
          const tagged = declaredErrorFields(error.schema)
          return tagged === undefined ? [] : [[tagged.tag, tagged] as const]
        }),
      ),
    ),
  )
  const errorTypes = Array.from(errors.values()).map((error) => {
    const fields = error.fields
      .map(([name, schema, optional]) => `readonly ${JSON.stringify(name)}${optional ? "?" : ""}: ${typeOf(schema)}`)
      .join("; ")
    return `export type ${error.identifier} = { readonly ${JSON.stringify(error.key)}: ${JSON.stringify(error.tag)}; ${fields} }\nexport const is${error.identifier} = (value: unknown): value is ${error.identifier} => typeof value === "object" && value !== null && ${JSON.stringify(error.key)} in value && value[${JSON.stringify(error.key)}] === ${JSON.stringify(error.tag)}`
  })
  const operations = groups
    .flatMap((group) =>
      group.endpoints.flatMap((endpoint) => {
        const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
        const schemas = {
          params: endpoint.params,
          query: endpoint.query,
          headers: endpoint.headers,
          payload: endpoint.payloads[0],
        }
        const input = endpoint.input
          .map((field) => {
            const schema = schemas[field.source]
            if (schema === undefined)
              throw new GenerationError({ reason: `Missing input schema: ${prefix}.${field.name}` })
            return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: (${typeOf(schema, field.source === "query")})[${JSON.stringify(field.name)}]`
          })
          .join("; ")
        const successSchema = endpoint.successes[0]
        const success =
          outputTypes?.[`${group.identifier}.${endpoint.operation.name}`]?.name ??
          typeOf(
            isStreamSchema(successSchema) && successSchema._tag === "StreamSse"
              ? successSchema.sseMode === "data"
                ? streamEncodedDataSchema(successSchema)
                : successSchema.events
              : successSchema,
          )
        return [
          ...(endpoint.operation.inputMode === "none" ? [] : [`export type ${prefix}Input = { ${input} }`]),
          `export type ${prefix}Output = ${endpoint.unwrapData ? `(${success})["data"]` : success}`,
        ]
      }),
    )
    .join("\n\n")
  const json = operations.includes("JsonValue")
    ? "export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue }"
    : ""
  const imports = [...new Set(Object.values(outputTypes ?? {}).map((override) => override.import))]
  return [...imports, json, ...errorTypes, operations].filter(Boolean).join("\n\n")
}

function renderPromiseClient(groups: ReadonlyArray<Group>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.flatMap((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
      return [...(endpoint.operation.inputMode === "none" ? [] : [`${prefix}Input`]), `${prefix}Output`]
    }),
  )
  const fields = groups.map((group) => {
    const methods = group.endpoints.map((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
      const argument =
        endpoint.operation.inputMode === "none"
          ? "requestOptions?: RequestOptions"
          : `input${endpoint.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input, requestOptions?: RequestOptions`
      const path = promisePath(endpoint.endpoint.path, endpoint.input)
      const access = (name: string) =>
        `input${endpoint.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(name)}]`
      const part = (source: InputField["source"]) => {
        const inputs = endpoint.input.filter((field) => field.source === source)
        return inputs.length === 0
          ? undefined
          : `{ ${inputs.map((field) => `${JSON.stringify(field.name)}: ${access(field.name)}`).join(", ")} }`
      }
      const parts = [
        endpoint.query === undefined ? undefined : `query: ${part("query")}`,
        endpoint.headers === undefined ? undefined : `headers: ${part("headers")}`,
        endpoint.payloads.length === 0 ? undefined : `body: ${part("payload")}`,
      ].filter((value): value is string => value !== undefined)
      const declaredStatuses = [...new Set(endpoint.errors.map((error) => error.status))]
      const descriptor = `{ method: ${JSON.stringify(endpoint.endpoint.method)}, path: ${path}${parts.length === 0 ? "" : `, ${parts.join(", ")}`}, successStatus: ${resolveHttpApiStatus(endpoint.successes[0].ast) ?? 200}, declaredStatuses: [${declaredStatuses.join(", ")}], empty: ${endpoint.operation.success === "void"} }`
      if (endpoint.operation.success === "stream") {
        const success = endpoint.successes[0]
        if (!isStreamSchema(success) || success._tag !== "StreamSse" || success.sseMode !== "data") {
          throw new GenerationError({
            reason: `Promise stream emission is not implemented: ${group.identifier}.${endpoint.endpoint.identifier}`,
          })
        }
        return `${JSON.stringify(endpoint.operation.name)}: (${argument}): AsyncIterable<${prefix}Output> => sse<${prefix}Output>(${descriptor}, requestOptions)`
      }
      const unwrap = endpoint.unwrapData ? ".then((value) => value.data)" : ""
      return `${JSON.stringify(endpoint.operation.name)}: (${argument}) => request<${endpoint.unwrapData ? `{ readonly data: ${prefix}Output }` : `${prefix}Output`}>(${descriptor}, requestOptions)${unwrap}`
    })
    if (group.endpoints[0]?.topLevel) return methods.join(", ")
    return `${JSON.stringify(group.identifier)}: { ${methods.join(", ")} }`
  })
  return `import type { ${imports.join(", ")} } from "./types"\nimport { ClientError } from "./client-error"\n\nexport interface ClientOptions {\n  readonly baseUrl: string\n  readonly fetch?: typeof globalThis.fetch\n  readonly headers?: HeadersInit\n}\n\nexport interface RequestOptions {\n  readonly signal?: AbortSignal\n  readonly headers?: HeadersInit\n}\n\ninterface RequestDescriptor {\n  readonly method: string\n  readonly path: string\n  readonly query?: Record<string, unknown>\n  readonly headers?: Record<string, unknown>\n  readonly body?: unknown\n  readonly successStatus: number\n  readonly declaredStatuses: ReadonlyArray<number>\n  readonly empty: boolean\n}\n\nexport function make(options: ClientOptions) {\n  const fetch = options.fetch ?? globalThis.fetch\n\n  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    const url = new URL(descriptor.path, options.baseUrl)\n    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)\n    const headers = new Headers(options.headers)\n    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {\n      if (value !== undefined && value !== null) headers.set(key, String(value))\n    }\n    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)\n    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")\n    return {\n      url,\n      init: {\n        method: descriptor.method,\n        signal: requestOptions?.signal,\n        headers,\n        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),\n      } satisfies RequestInit,\n    }\n  }\n\n  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    try {\n      const prepared = prepare(descriptor, requestOptions)\n      return await fetch(prepared.url, prepared.init)\n    } catch (cause) {\n      throw new ClientError("Transport", { cause })\n    }\n  }\n\n  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {\n    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })\n  }\n\n  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {\n    const response = await execute(descriptor, requestOptions)\n    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)\n    if (descriptor.empty) {\n      try {\n        await response.body?.cancel()\n      } catch {}\n      return undefined as A\n    }\n    return await json(response) as A\n  }\n\n  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({\n    async *[Symbol.asyncIterator]() {\n      const response = await execute(descriptor, requestOptions)\n      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)\n      if (!isContentType(response, "text/event-stream")) {\n        try {\n          await response.body?.cancel()\n        } catch {}\n        throw new ClientError("UnsupportedContentType")\n      }\n      if (response.body === null) throw new ClientError("MalformedResponse")\n      const reader = response.body.getReader()\n      const decoder = new TextDecoder()\n      let buffer = ""\n      try {\n        while (true) {\n          let next: ReadableStreamReadResult<Uint8Array>\n          try {\n            next = await reader.read()\n          } catch (cause) {\n            throw new ClientError("Transport", { cause })\n          }\n          buffer += decoder.decode(next.value, { stream: !next.done })\n          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")\n          const trailingCarriageReturn = !next.done && buffer.endsWith("\\r")\n          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)\n          buffer = buffer.replaceAll("\\r\\n", "\\n").replaceAll("\\r", "\\n")\n          if (trailingCarriageReturn) buffer += "\\r"\n          if (next.done && buffer !== "") buffer += "\\n\\n"\n          let boundary = buffer.indexOf("\\n\\n")\n          while (boundary >= 0) {\n            const block = buffer.slice(0, boundary)\n            buffer = buffer.slice(boundary + 2)\n            const data = block.split("\\n").flatMap((line) => line.startsWith("data:") ? [line.slice(5).trimStart()] : []).join("\\n")\n            if (data !== "") {\n              try {\n                yield JSON.parse(data) as A\n              } catch (cause) {\n                throw new ClientError("MalformedResponse", { cause })\n              }\n            }\n            boundary = buffer.indexOf("\\n\\n")\n          }\n          if (next.done) return\n        }\n      } finally {\n        try {\n          await reader.cancel()\n        } catch {}\n        reader.releaseLock()\n      }\n    },\n  })\n\n  return { ${fields.join(", ")} }\n}\n\nfunction appendQuery(params: URLSearchParams, key: string, value: unknown): void {\n  if (value === undefined || value === null) return\n  if (Array.isArray(value)) {\n    for (const item of value) appendQuery(params, key, item)\n    return\n  }\n  if (typeof value === "object") {\n    for (const [child, item] of Object.entries(value)) appendQuery(params, \`\${key}[\${child}]\`, item)\n    return\n  }\n  params.append(key, String(value))\n}\n\nasync function json(response: Response): Promise<unknown> {\n  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnsupportedContentType")\n  }\n  let text: string\n  try {\n    text = await response.text()\n  } catch (cause) {\n    throw new ClientError("Transport", { cause })\n  }\n  if (text === "") throw new ClientError("MalformedResponse")\n  try {\n    return JSON.parse(text)\n  } catch (cause) {\n    throw new ClientError("MalformedResponse", { cause })\n  }\n}\n\nfunction isContentType(response: Response, expected: string) {\n  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected\n}\n`
}

function promiseTypePrefix(group: string, endpoint: string) {
  return `${identifierPart(group)}${identifierPart(endpoint)}`
}

function clientEndpointName(name: string) {
  return name.slice(name.lastIndexOf(".") + 1)
}

function identifierPart(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")
}

// Effect 4's code document requires a toCode callback on every declaration,
// but class declarations carry none; their data shape is the inner struct,
// which is what Promise types render (matching the committed output).
// Expands bare class declarations to their inner type, copying nodes along
// the way so shared protocol schemas are never mutated. Suspend thunks are
// left alone: recursive schemas are rejected downstream regardless.
// AST nodes carry prototype methods (recur); a plain spread drops them,
// so copies preserve the prototype.
const copyAst = (ast: SchemaAST.AST, overrides: Record<string, unknown>): SchemaAST.AST =>
  Object.assign(Object.create(Object.getPrototypeOf(ast)), ast, overrides) as unknown as SchemaAST.AST

function expandClassDeclarations(ast: SchemaAST.AST, expanding = new Set<SchemaAST.AST>()): SchemaAST.AST {
  if (SchemaAST.isDeclaration(ast)) {
    const annotations = ast.annotations as Record<string, unknown> | undefined
    const isClass = annotations?.["~constructor"] !== undefined || annotations?.["~effect/Schema/Class"] !== undefined
    const hasCode = annotations?.generation !== undefined || typeof annotations?.toCode === "function"
    // Schema.Json lost its toCode hook in Effect 4; restore the rendering
    // the Promise types expect (Schema.Json becomes the JsonValue alias).
    const representation = annotations?.representation as { readonly id?: unknown } | undefined
    if (representation?.id === "effect/schema/Json" && !hasCode) {
      return copyAst(ast, {
        annotations: { ...annotations, toCode: () => ({ runtime: "Schema.Json", Type: "Schema.Json" }) },
      })
    }
    if (isClass && !hasCode) {
      if (expanding.has(ast)) return ast
      expanding.add(ast)
      const inner = expandClassDeclarations(ast.typeParameters[0], expanding)
      expanding.delete(ast)
      return inner
    }
    const expanded = ast.typeParameters.map((param) => expandClassDeclarations(param, expanding))
    const expandedEncoding = ast.encoding?.map((link) => {
      const expandedTo = expandClassDeclarations(link.to, expanding)
      return expandedTo === link.to ? link : { ...link, to: expandedTo }
    })
    const encodingChanged = expandedEncoding?.some((link, index) => link !== ast.encoding?.[index]) ?? false
    return expanded.every((param, index) => param === ast.typeParameters[index]) && !encodingChanged
      ? ast
      : copyAst(ast, { typeParameters: expanded, ...(expandedEncoding === undefined ? {} : { encoding: expandedEncoding }) })
  }
  if (SchemaAST.isSuspend(ast)) return ast
  const expandedEncoding = ast.encoding?.map((link) => {
    const expanded = expandClassDeclarations(link.to, expanding)
    return expanded === link.to ? link : { ...link, to: expanded }
  })
  const encodingChanged = expandedEncoding?.some((link, index) => link !== ast.encoding?.[index]) ?? false
  if (SchemaAST.isUnion(ast)) {
    const expanded = ast.types.map((type) => expandClassDeclarations(type, expanding))
    if (!encodingChanged && expanded.every((type, index) => type === ast.types[index])) return ast
    return copyAst(ast, { ...(expandedEncoding === undefined ? {} : { encoding: expandedEncoding }), types: expanded })
  }
  if (SchemaAST.isArrays(ast)) {
    const elements = ast.elements.map((element) => expandClassDeclarations(element, expanding))
    const rest = ast.rest.map((element) => expandClassDeclarations(element, expanding))
    if (
      !encodingChanged && elements.every((element, index) => element === ast.elements[index]) &&
      rest.every((element, index) => element === ast.rest[index])
    ) return ast
    return copyAst(ast, { ...(expandedEncoding === undefined ? {} : { encoding: expandedEncoding }), elements, rest })
  }
  if (SchemaAST.isObjects(ast)) {
    const propertySignatures = ast.propertySignatures.map((field) => {
      const expanded = expandClassDeclarations(field.type, expanding)
      return expanded === field.type ? field : { ...field, type: expanded }
    })
    const indexSignatures = ast.indexSignatures.map((index) => {
      const parameter = expandClassDeclarations(index.parameter, expanding)
      const type = expandClassDeclarations(index.type, expanding)
      return parameter === index.parameter && type === index.type ? index : { ...index, parameter, type }
    })
    if (
      !encodingChanged && propertySignatures.every((field, index) => field === ast.propertySignatures[index]) &&
      indexSignatures.every((index, index2) => index === ast.indexSignatures[index2])
    ) return ast
    return copyAst(ast, {
      ...(expandedEncoding === undefined ? {} : { encoding: expandedEncoding }),
      propertySignatures,
      indexSignatures,
    })
  }
  if (SchemaAST.isTemplateLiteral(ast)) {
    const parts = ast.parts.map((part) => expandClassDeclarations(part, expanding))
    if (!encodingChanged && parts.every((part, index) => part === ast.parts[index])) return ast
    return copyAst(ast, { ...(expandedEncoding === undefined ? {} : { encoding: expandedEncoding }), parts })
  }
  return expandedEncoding === undefined || !encodingChanged ? ast : copyAst(ast, { encoding: expandedEncoding })
}

function structuralType(schema: Schema.Constraint) {
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.toRepresentations([expandClassDeclarations(schema.ast)]),
  )
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({
      reason: `Referenced Promise types are not implemented: recursives=${Object.keys(document.references.recursives).join(", ")} artifacts=${document.artifacts.map((artifact) => artifact._tag === "Import" ? `Import:${artifact.importDeclaration}` : artifact._tag).join(" | ")}`,
    })
  }
  const references = new Map(
    document.references.nonRecursives.map((reference) => [reference.$ref, reference.code.Type]),
  )
  const expand = (type: string, seen = new Set<string>()): string => {
    for (const [reference, value] of references) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      if (!new RegExp(pattern).test(type)) continue
      if (seen.has(reference)) {
        throw new GenerationError({ reason: `Recursive Promise types are not implemented: ${reference}` })
      }
      type = type.replace(new RegExp(pattern, "g"), `(${expand(value, new Set([...seen, reference]))})`)
    }
    return type
  }
  return expand(document.codes[0].Type)
    .replaceAll(/ & Brand\.Brand<"[^"]+">/g, "")
    .replaceAll("Schema.Json", "JsonValue")
}

function promisePath(path: string, input: ReadonlyArray<InputField>) {
  if (path.includes("*")) throw new GenerationError({ reason: `Unsupported Promise path wildcard: ${path}` })
  const fields = new Set(input.filter((field) => field.source === "params").map((field) => field.name))
  const segments = path.split(/(:[A-Za-z_][A-Za-z0-9_]*)/g).filter(Boolean)
  const template = segments
    .map((segment) => {
      if (!segment.startsWith(":")) return segment.replaceAll("`", "\\`")
      const name = segment.slice(1)
      if (!fields.has(name)) throw new GenerationError({ reason: `Missing path parameter: ${name}` })
      return `\${encodeURIComponent(input.${name})}`
    })
    .join("")
  return `\`${template}\``
}

function uniqueModule(base: string, index: number, modules: ReadonlySet<string>) {
  if (!modules.has(base.toLowerCase())) return base
  const seed = `${base}-${index}`
  let suffix = 0
  while (modules.has(`${seed}${suffix === 0 ? "" : `-${suffix}`}`.toLowerCase())) suffix++
  return `${seed}${suffix === 0 ? "" : `-${suffix}`}`
}

function normalizeTransport(
  schema: Schema.Top | undefined,
  source: InputField["source"] | "success" | "error",
  endpoint: HttpApiEndpoint.Top,
  operation: string,
) {
  if (schema === undefined) return undefined
  if (isStreamSchema(schema)) return { schema, effectPortable: true } as const
  if (!metadataPortable(schema.ast, new Set())) {
    throw new GenerationError({ reason: `Unportable schema: ${operation}.${source}` })
  }
  // Effect 4's endpoint overloads require params encodable to a string tree,
  // which a type-erased decoded schema cannot prove statically. The rebuild
  // only reads ASTs back for the encoding comparison, so the cast changes no
  // runtime value.
  const decoded = Schema.toType(schema) as unknown as Schema.Top
  if (!isPathInput(endpoint.path)) {
    throw new GenerationError({ reason: `Invalid endpoint path: ${operation}` })
  }
  const rebuilt = HttpApiEndpoint.make(endpoint.method)(endpoint.identifier, endpoint.path, {
    ...(source === "params" ? { params: decoded } : undefined),
    ...(source === "query" ? { query: decoded } : undefined),
    ...(source === "headers" ? { headers: decoded } : undefined),
    ...(source === "payload" ? { payload: decoded } : undefined),
    ...(source === "success" ? { success: decoded } : { success: Schema.String }),
    ...(source === "error" ? { error: decoded } : undefined),
  })
  const normalized =
    source === "params"
      ? rebuilt.params
      : source === "query"
        ? rebuilt.query
        : source === "headers"
          ? rebuilt.headers
          : source === "payload"
            ? Array.from(rebuilt.payload.values())[0]?.schemas[0]
            : source === "success"
              ? Array.from(rebuilt.success)[0]
              : Array.from(rebuilt.error)[0]
  if (normalized === undefined) throw new GenerationError({ reason: `Unportable schema: ${operation}.${source}` })
  if (!sameEncoding(schema.ast, normalized.ast)) return { schema, effectPortable: false } as const
  return { schema: decoded, effectPortable: true } as const
}

function isPathInput(path: string): path is HttpRouter.PathInput {
  return path === "*" || path.startsWith("/")
}

function sameEncoding(left: SchemaAST.AST, right: SchemaAST.AST): boolean {
  if (left._tag !== right._tag || left.encoding?.length !== right.encoding?.length) return false
  if (
    left.encoding?.some((link, index) => {
      const other = right.encoding?.[index]
      return other === undefined || link.transformation !== other.transformation || !sameEncoding(link.to, other.to)
    })
  )
    return false
  if (!sameChecks(left.checks, right.checks) || !sameContext(left.context, right.context)) return false
  if (SchemaAST.isSuspend(left) && SchemaAST.isSuspend(right)) return sameEncoding(left.thunk(), right.thunk())
  if (SchemaAST.isUnion(left) && SchemaAST.isUnion(right)) {
    return (
      left.types.length === right.types.length &&
      left.types.every((ast, index) => sameEncoding(ast, right.types[index]))
    )
  }
  if (SchemaAST.isArrays(left) && SchemaAST.isArrays(right)) {
    return (
      left.elements.length === right.elements.length &&
      left.rest.length === right.rest.length &&
      left.elements.every((ast, index) => sameEncoding(ast, right.elements[index])) &&
      left.rest.every((ast, index) => sameEncoding(ast, right.rest[index]))
    )
  }
  if (SchemaAST.isObjects(left) && SchemaAST.isObjects(right)) {
    return (
      left.propertySignatures.length === right.propertySignatures.length &&
      left.indexSignatures.length === right.indexSignatures.length &&
      left.propertySignatures.every((field, index) => sameEncoding(field.type, right.propertySignatures[index].type)) &&
      left.indexSignatures.every(
        (field, index) =>
          sameEncoding(field.parameter, right.indexSignatures[index].parameter) &&
          sameEncoding(field.type, right.indexSignatures[index].type),
      )
    )
  }
  return true
}

function sameChecks(left: SchemaAST.Checks | undefined, right: SchemaAST.Checks | undefined): boolean {
  if (left?.length !== right?.length) return false
  if (left === undefined || right === undefined) return true
  return left.every((check, index) => {
    const other = right[index]
    if (other === undefined || check._tag !== other._tag) return false
    if (check._tag === "Filter" && other._tag === "Filter") {
      return check.run === other.run && check.aborted === other.aborted
    }
    return check._tag === "FilterGroup" && other._tag === "FilterGroup" && sameChecks(check.checks, other.checks)
  })
}

function sameContext(left: SchemaAST.Context | undefined, right: SchemaAST.Context | undefined) {
  // Effect 4 materializes an explicit default context on codec targets where
  // Effect 3 left it undefined; absent and default-false mean the same shape.
  return (left?.isOptional ?? false) === (right?.isOptional ?? false) &&
    (left?.isMutable ?? false) === (right?.isMutable ?? false)
}

export function write(
  output: Output,
  directory: string,
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const paths = new Set<string>()
    const normalizedPaths = new Set<string>()
    for (const file of output.files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(directory, { recursive: true })
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        fs.exists(join(directory, file.path)).pipe(
          Effect.flatMap((exists) => (exists ? fs.stat(join(directory, file.path)) : Effect.succeed(undefined))),
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        Effect.tryPromise({
          try: () => format(file.content, { filepath: file.path, parser: "typescript", semi: false, printWidth: 120 }),
          catch: (error) => new GenerationError({ reason: `Failed to format ${file.path}: ${String(error)}` }),
        }).pipe(Effect.flatMap((content) => fs.writeFileString(join(directory, file.path), content))),
      { concurrency: 8, discard: true },
    )
    yield* fs.writeFileString(manifest, JSON.stringify(output.files.map((file) => file.path).sort(), null, 2) + "\n")
  })
}

function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}

export function generate<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options: { readonly directory: string },
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.try({
    try: () => emitEffect(compile(api)),
    catch: (error) => (error instanceof GenerationError ? error : new GenerationError({ reason: String(error) })),
  }).pipe(Effect.flatMap((output) => write(output, options.directory)))
}

function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
    if (typeof field.name !== "string") {
      throw new GenerationError({ reason: `Input field must have a string name: ${operation}.${source}` })
    }
    return {
      name: field.name,
      source,
      optional: SchemaAST.isOptional(field.type),
    }
  })
}

function responseSchemas(schema: Schema.Top, path: string): Array<readonly [string, Schema.Constraint]> {
  if (HttpApiSchema.isNoContent(schema.ast)) return []
  if (!isStreamSchema(schema)) return [[path, schema]]
  if (schema._tag === "StreamUint8Array") return []
  const value = schema.sseMode === "data" ? streamDataSchema(schema) : schema.events
  return [
    [`${path}.${schema.sseMode}`, value],
    [`${path}.error`, schema.error],
  ]
}

function assertPortable(schema: Schema.Constraint, path: string, portable: Map<SchemaAST.AST, boolean>) {
  const visiting = new Set<SchemaAST.AST>()
  const taggedError = taggedErrorFields(schema)
  const visit = (ast: SchemaAST.AST): boolean => {
    const cached = portable.get(ast)
    if (cached !== undefined) return cached
    if (visiting.has(ast)) return true
    visiting.add(ast)
    const result = visitCurrent(ast)
    visiting.delete(ast)
    portable.set(ast, result)
    return result
  }
  const visitCurrent = (ast: SchemaAST.AST): boolean => {
    if (!annotationsPortable(ast.annotations)) return false
    if (!checksPortable(ast.checks) || ("encodingChecks" in ast && !checksPortable(ast.encodingChecks))) return false
    if (SchemaAST.isDeclaration(ast)) {
      // Effect 4 renders some declared schemas (Uint8Array) from a toCode
      // hook instead of a generation annotation; either supplies the code.
      // Class declarations pass here because the Promise path expands them
      // to their inner structs before building the document, and the
      // Effect-import path never builds one. Latent limit: emitEffect over
      // an API with nested classes still hits Effect's Missing toCode error.
      const annotations = ast.annotations as Record<string, unknown> | undefined
      const isClass = annotations?.["~constructor"] !== undefined || annotations?.["~effect/Schema/Class"] !== undefined
      return (generationPortable(ast.annotations?.generation) || typeof annotations?.toCode === "function" || isClass) && ast.typeParameters.every(visit)
    }
    if (ast.encoding !== undefined && ast.annotations?.generation === undefined) return false
    if (SchemaAST.isSuspend(ast)) return visit(ast.thunk())
    if (SchemaAST.isUnion(ast)) return ast.types.every(visit)
    if (SchemaAST.isArrays(ast)) {
      return ast.elements.every(visit) && ast.rest.every(visit)
    }
    if (SchemaAST.isObjects(ast)) {
      return (
        ast.propertySignatures.every((field) => visit(field.type)) &&
        ast.indexSignatures.every((index) => visit(index.parameter) && visit(index.type))
      )
    }
    if (SchemaAST.isTemplateLiteral(ast)) return ast.parts.every(visit)
    return true
  }
  if (taggedError !== undefined && SchemaAST.isDeclaration(schema.ast)) {
    if (
      schema.ast.checks !== undefined ||
      ("encodingChecks" in schema.ast && !checksPortable(schema.ast.encodingChecks)) ||
      schema.ast.typeParameters.some((ast) => ast.checks !== undefined) ||
      !schema.ast.typeParameters.every(visit)
    ) {
      throw new GenerationError({ reason: `Unportable schema: ${path}` })
    }
    return
  }
  if (!visit(schema.ast)) throw new GenerationError({ reason: `Unportable schema: ${path}` })
}

function checksPortable(checks: SchemaAST.Checks | undefined): boolean {
  if (checks === undefined) return true
  return checks.every((check) =>
    check._tag === "Filter"
      ? !check.aborted &&
        check.annotations?.representation !== undefined &&
        check.annotations?.arbitraryConstraint !== undefined
      : checksPortable(check.checks),
  )
}

function metadataPortable(ast: SchemaAST.AST, seen: Set<SchemaAST.AST>): boolean {
  if (seen.has(ast)) return true
  seen.add(ast)
  if (!annotationsPortable(ast.annotations) || !checksPortable(ast.checks)) return false
  if ("encodingChecks" in ast && !checksPortable(ast.encodingChecks)) return false
  if (ast.encoding?.some((link) => !metadataPortable(link.to, seen))) return false
  if (SchemaAST.isDeclaration(ast)) return ast.typeParameters.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isSuspend(ast)) return metadataPortable(ast.thunk(), seen)
  if (SchemaAST.isUnion(ast)) return ast.types.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isArrays(ast)) {
    return (
      ast.elements.every((item) => metadataPortable(item, seen)) &&
      ast.rest.every((item) => metadataPortable(item, seen))
    )
  }
  if (SchemaAST.isObjects(ast)) {
    return (
      ast.propertySignatures.every((field) => metadataPortable(field.type, seen)) &&
      ast.indexSignatures.every(
        (field) => metadataPortable(field.parameter, seen) && metadataPortable(field.type, seen),
      )
    )
  }
  return true
}

function generationPortable(generation: unknown): boolean {
  if (typeof generation !== "object" || generation === null) return false
  const value = generation as {
    readonly runtime?: unknown
    readonly Type?: unknown
    readonly importDeclaration?: unknown
  }
  if (typeof value.runtime !== "string" || typeof value.Type !== "string") return false
  if (value.importDeclaration !== undefined) {
    if (
      typeof value.importDeclaration !== "string" ||
      !/from ["']effect(?:\/[^"']+)?["']$/.test(value.importDeclaration)
    ) {
      return false
    }
  }
  const namespace =
    typeof value.importDeclaration === "string"
      ? /import(?: type)? \* as ([A-Za-z_$][\w$]*)/.exec(value.importDeclaration)?.[1]
      : undefined
  return value.runtime.startsWith("Schema.") || (namespace !== undefined && value.runtime.startsWith(`${namespace}.`))
}

function annotationsPortable(annotations: Schema.Annotations.Annotations | undefined) {
  if (annotations === undefined) return true
  return Object.entries(annotations).every(([key, value]) => {
    if (
      ["toCodec", "toCodecJson", "toCodecStringTree", "toCodecArbitrary", "toArbitrary", "toFormatter", "toEquivalence", "toCode", "~effect/Schema/Class", "~constructor"].includes(key)
    ) {
      return true
    }
    if (key === "generation") return generationPortable(value)
    return serializable(value)
  })
}

function serializable(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(serializable)
  if (typeof value !== "object") return false
  return Object.values(value).every(serializable)
}

function taggedErrorFields(schema: Schema.Constraint) {
  const fields = declaredErrorFields(schema)
  return fields?.key === "_tag" ? fields : undefined
}

function declaredErrorFields(schema: Schema.Constraint) {
  if (!SchemaAST.isDeclaration(schema.ast) || (schema.ast.annotations?.["~effect/Schema/Class"] === undefined && schema.ast.annotations?.["~constructor"] === undefined)) {
    return undefined
  }
  const fields = schema.ast.typeParameters[0]
  if (!SchemaAST.isObjects(fields) || fields.indexSignatures.length > 0) return undefined
  const key = fields.propertySignatures.find((field) => field.name === "_tag" || field.name === "name")?.name
  if (key !== "_tag" && key !== "name") return undefined
  const tag = fields.propertySignatures.find((field) => field.name === key)?.type
  if (tag === undefined || !SchemaAST.isLiteral(tag) || typeof tag.literal !== "string") return undefined
  return {
    key,
    tag: tag.literal,
    identifier: SchemaAST.resolveIdentifier(schema.ast) ?? tag.literal,
    fields: fields.propertySignatures.flatMap((field) =>
      field.name === key || typeof field.name !== "string"
        ? []
        : [[field.name, Schema.make(field.type), SchemaAST.isOptional(field.type)] as const],
    ),
  }
}

function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}

function isStreamSchema(schema: Schema.Top): schema is Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" | "StreamUint8Array" }> {
  return "_tag" in schema && (schema._tag === "StreamSse" || schema._tag === "StreamUint8Array")
}

function streamDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  return Schema.make(streamDataAst(Schema.toType(schema.events).ast))
}

function streamEncodedDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  const data = streamDataAst(schema.events.ast)
  const encodedAst = data.encoding?.at(-1)?.to
  if (encodedAst === undefined) throw new GenerationError({ reason: "Invalid SSE data schema" })
  const encoded = resolveContentSchema(encodedAst)
  // Effect 4 no longer annotates the JSON string with its content schema.
  // The data field's own encoding jumps straight to String, so strip it
  // and encode the union members instead: that yields the JSON form the
  // Promise types render (structs, strings), not the decoded form
  // (DateTime fields would otherwise leak in) and not the raw string.
  if (!SchemaAST.isAST(encoded)) {
    return Schema.make(Schema.toEncoded(Schema.make(copyAst(data, { encoding: undefined }))).ast)
  }
  return Schema.make(encoded)
}

function streamDataAst(ast: SchemaAST.AST) {
  if (!SchemaAST.isObjects(ast)) throw new GenerationError({ reason: "Invalid SSE data schema" })
  const data = ast.propertySignatures.find((field) => field.name === "data")?.type
  if (data === undefined) throw new GenerationError({ reason: "Invalid SSE data schema" })
  return data
}

function streamEffectPortable(schema: Schema.Top) {
  if (!isStreamSchema(schema) || schema._tag === "StreamUint8Array" || schema.sseMode === "events") return true
  const rebuilt = HttpApiSchema.StreamSse({
    data: streamDataSchema(schema),
    error: schema.error,
    contentType: schema.contentType,
  })
  // Effect 4 constructs the SSE framing transformation fresh on every
  // StreamSse call, so the rebuilt events never share transformation identity
  // with the original. The generated adapter consumes decoded data, so the
  // type-side events are the shape that must match.
  return sameEncoding(Schema.toType(schema.events).ast, Schema.toType(rebuilt.events).ast)
}

function renderGroup(group: Group, groupIndex: number) {
  const slots: Array<Slot> = []
  const adapters: Array<string> = []
  const endpointSources = group.endpoints.map((operation, endpointIndex) => {
    const {
      endpoint,
      errors,
      headers: endpointHeaders,
      params: endpointParams,
      payloads: endpointPayloads,
      query: endpointQuery,
      successes,
    } = operation
    const prefix = `Endpoint${endpointIndex}`
    const params = addSlot(endpointParams, `${prefix}Params`)
    const query = addSlot(endpointQuery, `${prefix}Query`)
    const headers = addSlot(endpointHeaders, `${prefix}Headers`)
    const payloads = endpointPayloads.map((schema, index) => addSlot(schema, `${prefix}Payload${index}`)!)
    const success = renderSuccess(successes[0], `${prefix}Success`)
    const errorSlots = errors.map((error, index) => addSlot(error.schema, `${prefix}Error${index}`)!)
    const options = [
      params === undefined ? undefined : `params: ${params.name}`,
      query === undefined ? undefined : `query: ${query.name}`,
      headers === undefined ? undefined : `headers: ${headers.name}`,
      payloads.length === 0
        ? undefined
        : `payload: ${payloads.length === 1 ? payloads[0].name : `[${payloads.map((slot) => slot.name).join(", ")}]`}`,
      `success: ${success.source}`,
      errorSlots.length === 0
        ? undefined
        : `error: ${errorSlots.length === 1 ? errorSlots[0].name : `[${errorSlots.map((slot) => slot.name).join(", ")}]`}`,
    ].filter((option): option is string => option !== undefined)
    const schemaBySource = { params, query, headers, payload: payloads[0] }
    const inputType = operation.input
      .map((field) => {
        const slot = schemaBySource[field.source]
        if (slot === undefined) {
          throw new GenerationError({ reason: `Missing input schema: ${group.identifier}.${endpoint.identifier}` })
        }
        return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: (typeof ${slot.name}.Type)[${JSON.stringify(field.name)}]`
      })
      .join("; ")
    const argument =
      operation.operation.inputMode === "none"
        ? ""
        : `input${operation.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
    const request = (["params", "query", "headers", "payload"] as const)
      .flatMap((source) => {
        const slot = schemaBySource[source]
        if (slot === undefined) return []
        const fields = operation.input
          .filter((field) => field.source === source)
          .map(
            (field) =>
              `${JSON.stringify(field.name)}: input${operation.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(field.name)}]`,
          )
        return [`${source}: { ${fields.join(", ")} }`]
      })
      .join(", ")
    const declared = [...errorSlots, ...(success.streamError === undefined ? [] : [success.streamError])]
    const declaredSchema =
      declared.length === 0 ? "Schema.Never" : `Schema.Union([${declared.map((slot) => slot.name).join(", ")}])`
    const rawCall = `raw[${JSON.stringify(endpoint.identifier)}]({ ${request} })`
    const mapped = `${rawCall}.pipe(Effect.mapError(map${prefix}Error)${operation.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
    const inputDeclaration = operation.operation.inputMode === "none" ? "" : `type ${prefix}Input = { ${inputType} }\n`
    adapters.push(
      `${inputDeclaration}const ${prefix}DeclaredError = ${declaredSchema}\nconst map${prefix}Error = (error: unknown) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : Schema.is(${prefix}DeclaredError)(error) ? error : new ClientError({ cause: error })\nconst ${prefix} = (raw: RawGroup) => (${argument}) => ${operation.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(map${prefix}Error), Effect.map((stream) => stream.pipe(Stream.mapError(map${prefix}Error)))))` : mapped}`,
    )
    return `HttpApiEndpoint.make(${JSON.stringify(endpoint.method)})(${JSON.stringify(endpoint.identifier)}, ${JSON.stringify(endpoint.path)}, { ${options.join(", ")} })`
  })

  function addSlot(schema: Schema.Constraint | undefined, name: string) {
    if (schema === undefined) return undefined
    const slot = { name, schema }
    slots.push(slot)
    return slot
  }

  function renderSuccess(schema: Schema.Top, name: string) {
    if (!isStreamSchema(schema)) return { source: addSlot(schema, name)!.name }
    const status = resolveHttpApiStatus(schema.ast) ?? 200
    const annotate = status === 200 ? "" : `.pipe(HttpApiSchema.status(${status}))`
    if (schema._tag === "StreamUint8Array") {
      return {
        source: `HttpApiSchema.StreamUint8Array({ contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      }
    }
    const value = addSlot(
      schema.sseMode === "data" ? streamDataSchema(schema) : schema.events,
      `${name}${schema.sseMode === "data" ? "Data" : "Events"}`,
    )!
    const error = addSlot(schema.error, `${name}Error`)!
    return {
      source: `HttpApiSchema.StreamSse({ ${schema.sseMode}: ${value.name}, error: ${error.name}, contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      streamError: error,
    }
  }

  const declarations = renderSchemas(slots)
  const groupSource = `HttpApiGroup.make(${JSON.stringify(group.identifier)}, { topLevel: ${group.endpoints[0]?.topLevel ?? false} })${endpointSources.map((endpoint) => `.add(${endpoint})`).join("")}`
  const usesHttpApiSchema = endpointSources.some((source) => source.includes("HttpApiSchema."))
  const methods = group.endpoints
    .map((item, index) => `${JSON.stringify(item.operation.name)}: Endpoint${index}(raw)`)
    .join(", ")
  const rawGroup = group.endpoints[0]?.topLevel
    ? `HttpApiClient.Client<typeof Group${groupIndex}>`
    : `HttpApiClient.Client.Group<typeof Group${groupIndex}, never, never>`
  const usesStream = group.endpoints.some((item) => item.operation.success === "stream")
  return `// Generated by @opencode-ai/httpapi-codegen. Do not edit.\nimport { Effect, Schema${usesStream ? ", Stream" : ""} } from "effect"\nimport { Sse } from "effect/encoding"\nimport { HttpClientError } from "effect/http"\nimport { HttpApiClient, HttpApiEndpoint, HttpApiGroup${usesHttpApiSchema ? ", HttpApiSchema" : ""} } from "effect/http-api"\nimport { ClientError } from "./client-error"\n\n${declarations}\n\nexport const Group${groupIndex} = ${groupSource}\n\ntype RawGroup = ${rawGroup}\n\n${adapters.join("\n\n")}\n\nexport const adaptGroup${groupIndex} = (raw: RawGroup) => ({ ${methods} })\n`
}

function renderSchemas(slots: ReadonlyArray<Slot>) {
  if (slots.length === 0) return ""
  const classes = new Map(
    slots.flatMap((slot, index) => {
      const tagged = taggedErrorFields(slot.schema)
      return tagged === undefined ? [] : [[index, tagged] as const]
    }),
  )
  const expanded = [
    ...slots.map((slot, index) => (classes.has(index) ? { name: slot.name, schema: Schema.Never } : slot)),
    ...Array.from(classes.values()).flatMap((tagged, classIndex) =>
      tagged.fields.map(([name, schema]) => ({ name: `Class${classIndex}${name}`, schema })),
    ),
  ]
  const [first, ...rest] = expanded
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.toRepresentations([first.schema.ast, ...rest.map((slot) => slot.schema.ast)]),
  )
  const artifacts = document.artifacts.flatMap((artifact) => {
    if (artifact._tag === "Import") return [artifact.importDeclaration]
    if (artifact._tag === "Enum") return [artifact.code.runtime]
    return [`const ${artifact.identifier} = ${artifact.code.runtime}`]
  })
  const references = [
    ...document.references.nonRecursives.map(({ $ref, code }) => `const ${$ref} = ${code.runtime}`),
    ...Object.entries(document.references.recursives).map(
      ([$ref, code]) => `type ${$ref} = ${code.Type}\nconst ${$ref}: Schema.Codec<${$ref}> = ${code.runtime}`,
    ),
  ]
  let fieldIndex = slots.length
  const declarations = slots.map((slot, index) => {
    const tagged = classes.get(index)
    if (tagged === undefined) {
      // Statuses moved to context annotations in Effect 4, which the code
      // document does not emit; re-attach them so rebuilt endpoints keep
      // their response status.
      const extra = Object.entries({
        httpApiStatus: contextAnnotation(slot.schema.ast, "httpApiStatus"),
        "~httpApiEncoding": contextAnnotation(slot.schema.ast, "~httpApiEncoding"),
      }).filter(([key, value]) => value !== undefined && !(slot.schema.ast.annotations !== undefined && key in slot.schema.ast.annotations))
      const annotate = extra.length === 0
        ? ""
        : `.annotate({ ${extra.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} })`
      return `const ${slot.name} = ${document.codes[index].runtime}${annotate}`
    }
    const fields = tagged.fields
      .map(([name]) => `${JSON.stringify(name)}: ${document.codes[fieldIndex++].runtime}`)
      .join(", ")
    const annotations = Object.entries({
      httpApiStatus: resolveHttpApiStatus(slot.schema.ast),
      "~httpApiEncoding": resolveHttpApiEncoding(slot.schema.ast),
    }).filter((entry) => entry[1] !== undefined)
    const annotate =
      annotations.length === 0
        ? ""
        : `.annotate({ ${annotations.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} })`
    return `class ${slot.name}Class extends Schema.TaggedError<${slot.name}Class>(${JSON.stringify(tagged.identifier)})(${JSON.stringify(tagged.tag)}, { ${fields} }) {}\nconst ${slot.name} = ${slot.name}Class${annotate}`
  })
  return [...artifacts, ...references, ...declarations].join("\n\n")
}

function renderClient(groups: ReadonlyArray<Group>) {
  const imports = groups
    .map((group, index) => `import { adaptGroup${index}, Group${index} } from ${JSON.stringify(`./${group.module}`)}`)
    .join("\n")
  const api = `HttpApi.make("generated")${groups.map((_, index) => `.add(Group${index})`).join("")}`
  const fields = groups.flatMap((group, index) => {
    if (!group.endpoints[0]?.topLevel) {
      return [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.identifier)}])`]
    }
    const raw = `{ ${group.endpoints.map((item) => `${JSON.stringify(item.endpoint.identifier)}: raw[${JSON.stringify(item.endpoint.identifier)}]`).join(", ")} }`
    return [`...adaptGroup${index}(${raw})`]
  })
  return `// Generated by @opencode-ai/httpapi-codegen. Do not edit.\nimport { Effect } from "effect"\nimport { HttpApi, HttpApiClient } from "effect/http-api"\n${imports}\n\nconst Api = ${api}\nconst adaptClient = (raw: HttpApiClient.ForApi<typeof Api>) => ({ ${fields.join(", ")} })\n\nexport const make = (options?: { readonly baseUrl?: URL | string }) =>\n  HttpApiClient.make(Api, options).pipe(Effect.map(adaptClient))\n`
}
