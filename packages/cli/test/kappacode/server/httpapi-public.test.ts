import { describe, expect, test } from "bun:test"
import { Result, Schema as EffectSchema } from "effect"
import { OpenApi } from "effect/http-api"
import { AgentBuilderPaths } from "../../../src/kappacode/server/httpapi/groups/agent-builder.ts"
import { BackgroundProcessPaths } from "../../../src/kappacode/server/httpapi/groups/background-process.ts"
import { BranchNamePaths } from "../../../src/kappacode/server/httpapi/groups/branch-name.ts"
import { ConfigConsolePaths } from "../../../src/kappacode/server/httpapi/groups/config-console.ts"
import { IndexingPaths, KappaEmbeddingModel } from "../../../src/kappacode/server/httpapi/groups/indexing.ts"
import { KappaGatewayPaths } from "../../../src/kappacode/server/httpapi/groups/kappa-gateway.ts"
import { KappacodePaths } from "../../../src/kappacode/server/httpapi/groups/kappacode.ts"
import { MemoryPaths } from "../../../src/kappacode/server/httpapi/groups/memory.ts"
import { NetworkPaths } from "../../../src/kappacode/server/httpapi/groups/network.ts"
import { TelemetryPaths } from "../../../src/kappacode/server/httpapi/groups/telemetry.ts"
import { ExperimentalPaths } from "../../../src/server/routes/instance/httpapi/groups/experimental.ts"
import { SessionPaths } from "../../../src/server/routes/instance/httpapi/groups/session.ts"
import { PublicApi } from "../../../src/server/routes/instance/httpapi/public.ts"

type Schema = {
  anyOf?: Schema[]
  items?: Schema
  properties?: Record<string, Schema>
  type?: string
  enum?: string[]
  minLength?: number
  maxLength?: number
  pattern?: string
}

type Parameter = {
  in?: string
  name?: string
  schema?: Schema
}

type Method = "get" | "post" | "patch" | "put"

type Body = {
  content?: Record<string, { schema?: Schema }>
}

describe("Kappa PublicApi OpenAPI contract", () => {
  test("exposes board paging and reset with a minimal snapshot", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const path = KappacodePaths.sessionBoard.replace(":sessionID", "{sessionID}")
    const reset = KappacodePaths.resetSessionBoard.replace(":sessionID", "{sessionID}")
    const query = spec.paths[path]?.get?.parameters as Parameter[] | undefined
    expect(spec.paths[path]?.get?.operationId).toBe("kappacode.sessionBoard")
    expect(spec.paths[reset]?.post?.operationId).toBe("kappacode.resetSessionBoard")
    expect(query?.find((field) => field.name === "limit")?.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 50,
    })
    expect(Object.keys(spec.components?.schemas?.SessionBoard.properties ?? {}).sort()).toEqual([
      "cursor",
      "hasMore",
      "messages",
      "ownerSessionID",
      "revision",
    ])
  })

  test("uses Kappa branding", () => {
    const spec = OpenApi.fromApi(PublicApi)
    expect(spec.info.title).toBe("kappa")
    expect(spec.info.description).toBe("kappa api")
  })

  test("includes legacy Kappa events in the generated SDK contract", () => {
    const spec = JSON.stringify(OpenApi.fromApi(PublicApi))
    for (const type of [
      "suggestion.shown",
      "session.network.asked",
      "background_process.updated",
      "indexing.status",
    ]) {
      expect(spec).toContain(type)
    }
  })

  test("omits interactive terminal routes and events while preserving PTY routes", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const serialized = JSON.stringify(spec)
    expect(serialized).not.toContain("interactive-terminal")
    expect(serialized).not.toContain("interactive_terminal")
    expect(serialized).not.toContain("InteractiveTerminal")
    expect(spec.paths["/pty"]?.post).toBeDefined()
    expect(spec.paths["/pty/{ptyID}/connect"]?.get).toBeDefined()
  })

  test("constrains embedding model metadata", () => {
    const accepts = (dimension: number, scoreThreshold: number) =>
      Result.isSuccess(
        EffectSchema.decodeUnknownResult(KappaEmbeddingModel)({
          id: "provider/model",
          name: "Model",
          dimension,
          scoreThreshold,
        }),
      )

    expect(accepts(1, 0)).toBe(true)
    expect(accepts(1024, 1)).toBe(true)
    expect(accepts(0, 0.5)).toBe(false)
    expect(accepts(1.5, 0.5)).toBe(false)
    expect(accepts(1024, -0.1)).toBe(false)
    expect(accepts(1024, 1.1)).toBe(false)
  })

  test("constrains agent builder route ids", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const save = AgentBuilderPaths.save.replace(":id", "{id}")
    const params = spec.paths[save]?.put?.parameters as Parameter[] | undefined
    const schema = params?.find((param) => param.name === "id")?.schema

    expect(schema).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]*$",
    })
  })

  test("keeps workspace routing queries on background process routes", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const routes = [
      { method: "get", path: BackgroundProcessPaths.list },
      { method: "get", path: BackgroundProcessPaths.get },
      { method: "get", path: BackgroundProcessPaths.logs },
      { method: "post", path: BackgroundProcessPaths.stop },
      { method: "post", path: BackgroundProcessPaths.restart },
      { method: "post", path: BackgroundProcessPaths.stopSession },
    ] satisfies Array<{ method: Method; path: string }>

    for (const route of routes) {
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
      const params = spec.paths[path]?.[route.method]?.parameters as Parameter[] | undefined
      const query = params?.filter((param) => param.in === "query").map((param) => param.name)
      expect(query, `${route.method.toUpperCase()} ${route.path}`).toEqual(["directory", "workspace"])
    }
  })

  test("keeps directory routing queries on Kappa Console routes", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const routes = [
      { method: "get", path: ExperimentalPaths.worktreeDiff },
      { method: "get", path: ExperimentalPaths.worktreeDiffSummary },
      { method: "get", path: ExperimentalPaths.worktreeDiffFile },
      { method: "post", path: SessionPaths.viewed },
      { method: "get", path: ConfigConsolePaths.overlay },
      { method: "patch", path: ConfigConsolePaths.overlay },
      { method: "get", path: IndexingPaths.status },
      { method: "get", path: IndexingPaths.models },
    ] satisfies Array<{ method: Method; path: string }>

    for (const route of routes) {
      const params = spec.paths[route.path]?.[route.method]?.parameters as Parameter[] | undefined
      const query = params?.filter((param) => param.in === "query").map((param) => param.name)
      expect(query, `${route.method.toUpperCase()} ${route.path}`).toContain("directory")
      expect(query, `${route.method.toUpperCase()} ${route.path}`).toContain("workspace")
    }
  })

  test("keeps workspace routing queries on all Kappa-owned routed endpoints", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const routes = [
      { method: "post", path: AgentBuilderPaths.preview },
      { method: "put", path: AgentBuilderPaths.save },
      { method: "post", path: "/commit-message" },
      { method: "post", path: "/enhance-prompt" },
      { method: "get", path: NetworkPaths.list },
      { method: "post", path: NetworkPaths.reply },
      { method: "post", path: NetworkPaths.reject },
      { method: "post", path: TelemetryPaths.capture },
      { method: "post", path: TelemetryPaths.setEnabled },
      { method: "get", path: ConfigConsolePaths.sources },
      { method: "get", path: ConfigConsolePaths.effective },
      { method: "get", path: ConfigConsolePaths.rules },
      { method: "put", path: ConfigConsolePaths.rules },
      { method: "get", path: ConfigConsolePaths.modelState },
      { method: "patch", path: ConfigConsolePaths.modelState },
      { method: "get", path: ConfigConsolePaths.tuiConfig },
      { method: "get", path: ConfigConsolePaths.tuiKeybinds },
      { method: "patch", path: ConfigConsolePaths.tuiConfig },
      { method: "get", path: KappacodePaths.providerUsage },
      { method: "post", path: KappacodePaths.providerUsageRefresh },
      { method: "get", path: KappacodePaths.sessionModelUsage },
      { method: "post", path: BranchNamePaths.generate },
      { method: "get", path: MemoryPaths.status },
      { method: "get", path: MemoryPaths.show },
      { method: "post", path: MemoryPaths.enable },
      { method: "post", path: MemoryPaths.disable },
      { method: "post", path: MemoryPaths.configure },
      { method: "post", path: MemoryPaths.rebuild },
      { method: "post", path: MemoryPaths.remember },
      { method: "post", path: MemoryPaths.correct },
      { method: "post", path: MemoryPaths.forget },
      { method: "post", path: MemoryPaths.purge },
    ] satisfies Array<{ method: Method; path: string }>

    for (const route of routes) {
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
      const params = spec.paths[path]?.[route.method]?.parameters as Parameter[] | undefined
      const query = params?.filter((param) => param.in === "query").map((param) => param.name)
      expect(query, `${route.method.toUpperCase()} ${route.path}`).toContain("directory")
      expect(query, `${route.method.toUpperCase()} ${route.path}`).toContain("workspace")
    }
  })

  test("keeps personal organization resets nullable", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const body = spec.paths[KappaGatewayPaths.organization]?.post?.requestBody as Body | undefined
    const schema = body?.content?.["application/json"]?.schema
    const props = schema?.properties
    expect(props?.organizationId).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] })
  })

  test("keeps branch-name responses nullable", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const path = BranchNamePaths.generate.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    const body = spec.paths[path]?.post?.responses?.["200"] as Body | undefined
    const branch = body?.content?.["application/json"]?.schema?.properties?.branch

    expect(branch).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] })
  })

  test("keeps Kilo gateway responses nullable", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const response = (path: string) => {
      const body = spec.paths[path]?.get?.responses?.["200"] as Body | undefined
      return body?.content?.["application/json"]?.schema
    }

    const profile = response(KappaGatewayPaths.profile)?.properties
    expect(profile?.balance).toEqual({ anyOf: [expect.objectContaining({ type: "object" }), { type: "null" }] })
    expect(profile?.kappaPass).toEqual({ anyOf: [expect.objectContaining({ type: "object" }), { type: "null" }] })
    expect(profile?.profile?.properties?.selectedOrganizationId).toEqual({ type: "string" })
    expect(profile?.profile?.properties?.hasPersonalAccount).toEqual({ type: "boolean" })
    const pass = profile?.kappaPass?.anyOf?.find((item) => item.type === "object")?.properties
    expect(pass?.nextBillingAt).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] })
    expect(profile?.currentOrgId).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] })

    const auth = response(KappaGatewayPaths.authStatus)?.properties
    expect(auth).toEqual({
      authenticated: { type: "boolean" },
      type: { type: "string", enum: ["api", "oauth"] },
      organizationId: { type: "string" },
    })

    const sessions = response(KappaGatewayPaths.cloudSessions)?.properties
    expect(sessions?.cliSessions?.items?.properties?.title).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }],
    })
    expect(sessions?.nextCursor).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] })
  })

  test("keeps transcription prompts in the public contract", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const body = spec.paths[KappaGatewayPaths.audioTranscriptions]?.post?.requestBody as Body | undefined
    const schema = body?.content?.["application/json"]?.schema
    expect(schema?.properties?.prompt).toEqual({ type: "string" })
  })

  test("keeps provider usage flat and credential-free", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const schemas = (spec.components?.schemas ?? {}) as Record<string, Schema>
    const usage = Object.fromEntries(Object.entries(schemas).filter(([name]) => name.startsWith("ProviderUsage")))
    const keys = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(keys)
      if (!value || typeof value !== "object") return []
      return Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)])
    }
    const fields = keys(usage).map((key) => key.toLowerCase())

    expect(spec.paths[KappacodePaths.providerUsage]?.get?.responses?.["200"]).toBeDefined()
    expect(spec.paths[KappacodePaths.providerUsageRefresh]?.post?.responses?.["200"]).toBeDefined()
    expect(schemas.ProviderUsageSnapshot?.properties?.windows).toBeDefined()
    for (const forbidden of [
      "key",
      "token",
      "authorization",
      "raw",
      "endpoint",
      "stripepaymentmethodid",
      "inventoryid",
      "upstreamplanid",
      "fingerprint",
      "ciphertext",
    ]) {
      expect(
        fields.filter((field) => field.includes(forbidden)),
        forbidden,
      ).toEqual([])
    }
  })

  test("documents the transcription model catalog route", () => {
    const spec = OpenApi.fromApi(PublicApi)
    const route = spec.paths[KappaGatewayPaths.transcriptionModels]?.get
    const query = (route?.parameters as Parameter[] | undefined)?.map((item) => item.name)

    expect(query).toEqual(["directory", "workspace"])
    expect(route?.responses?.["200"]?.content?.["application/json"]?.schema).toMatchObject({ type: "array" })
  })
})
