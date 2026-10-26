import { Config, ConfigProvider, Context, Effect, Layer, Option, Schema } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.schema(Schema.Boolean, name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.schema(Schema.Number, name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("KAPPA_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.schema(Schema.Boolean, name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("KAPPA_AUTO_SHARE"),
  pure: bool("KAPPA_PURE"),
  disableDefaultPlugins: bool("KAPPA_DISABLE_DEFAULT_PLUGINS"),
  disableChannelDb: bool("KAPPA_DISABLE_CHANNEL_DB"), // kappacode_change
  disableEmbeddedWebUi: bool("KAPPA_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("KAPPA_DISABLE_EXTERNAL_SKILLS"),
  disableSkillShell: bool("KAPPA_DISABLE_SKILL_SHELL"), // kappacode_change - disable shell injection in skill bodies
  disableLspDownload: bool("KAPPA_DISABLE_LSP_DOWNLOAD"),
  skipMigrations: bool("KAPPA_SKIP_MIGRATIONS"), // kappacode_change
  disableClaudeCodePrompt: Config.all({
    broad: bool("KAPPA_DISABLE_CLAUDE_CODE"),
    direct: bool("KAPPA_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("KAPPA_DISABLE_CLAUDE_CODE"),
    direct: bool("KAPPA_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("KAPPA_ENABLE_EXA"),
    legacy: bool("KAPPA_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("KAPPA_ENABLE_PARALLEL"),
    legacy: bool("KAPPA_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("KAPPA_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("KAPPA_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("KAPPA_EXPERIMENTAL_SCOUT"), // kappacode_change
  experimentalReferences: enabledByExperimental("KAPPA_EXPERIMENTAL_REFERENCES"),
  // kappacode_change start - enabled by default, with an opt-out kill switch
  experimentalBackgroundSubagents: Config.schema(Schema.Boolean, "KAPPA_EXPERIMENTAL_BACKGROUND_SUBAGENTS").pipe(
    Config.withDefault(true),
  ),
  // kappacode_change - auto-promote a foreground subagent to background after this deadline (ms);
  // default 4s (kairos ceiling) so a long-running child yields a live background handle
  // instead of blocking the turn. Requires KAPPA_FOREGROUND_TASK_DEADLINE_MS to be a positive
  // integer when set.
  foregroundSubagentDeadlineMs: positiveInteger("KAPPA_FOREGROUND_TASK_DEADLINE_MS").pipe(Config.withDefault(4_000)),
  // kappacode_change end
  experimentalLspTy: bool("KAPPA_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("KAPPA_EXPERIMENTAL_LSP_TOOL"),
  // kappacode_change start - self-context tools
  experimentalContextTools: enabledByExperimental("KAPPA_EXPERIMENTAL_CONTEXT_TOOLS"),
  // kappacode_change end
  experimentalOxfmt: enabledByExperimental("KAPPA_EXPERIMENTAL_OXFMT"),
  experimentalCodeMode: enabledByExperimental("KAPPA_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("KAPPA_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalSessionSwitcher: enabledByExperimental("KAPPA_EXPERIMENTAL_SESSION_SWITCHER"), // kappacode_change
  // kappacode_change start - enabled by default, with an opt-out kill switch
  experimentalSharedAgentBoard: Config.schema(Schema.Boolean, "KAPPA_EXPERIMENTAL_SHARED_AGENT_BOARD").pipe(
    Config.withDefault(true),
  ),
  // kappacode_change end
  experimentalWorkspaces: enabledByExperimental("KAPPA_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("KAPPA_EXPERIMENTAL_ICON_DISCOVERY"),
  experimentalMcpApps: enabledByExperimental("KAPPA_EXPERIMENTAL_MCP_APPS"), // kappacode_change
  outputTokenMax: positiveInteger("KAPPA_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("KAPPA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("KAPPA_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("KAPPA_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.schema(Schema.String, "KAPPA_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags.ts"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
