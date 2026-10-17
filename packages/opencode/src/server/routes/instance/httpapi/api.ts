import { Schema } from "effect"
import { HttpApi } from "effect/unstable/httpapi"
import { EventV2 } from "@opencode-ai/core/event"
import { EventManifest } from "@/event-manifest"
import { Credential } from "@opencode-ai/core/credential"
import { Integration } from "@opencode-ai/core/integration"
import { SkillV2 } from "@opencode-ai/core/skill"
import { InstanceDisposed } from "@/server/event"
import { Question } from "@/question"
import { BusEvent } from "@/bus/bus-event" // kappacode_change - include legacy Kappa events until they migrate to EventV2
import { ConfigApi } from "./groups/config"
import { ControlApi } from "./groups/control"
import { ControlPlaneApi } from "./groups/control-plane"
import { EventApi } from "./groups/event"
import { ExperimentalApi } from "./groups/experimental"
import { FileApi } from "./groups/file"
import { InstanceApi } from "./groups/instance"
import { McpApi } from "./groups/mcp"
import { PermissionApi } from "./groups/permission"
import { ProjectApi } from "./groups/project"
import { ProjectCopyApi } from "./groups/project-copy"
import { ProviderApi } from "./groups/provider"
import { PtyApi, PtyConnectApi } from "./groups/pty"
import { QuestionApi } from "./groups/question"
import { SessionApi } from "./groups/session"
import { SyncApi } from "./groups/sync"
import { TuiApi } from "./groups/tui"
import { WorkspaceApi } from "./groups/workspace"
// kappacode_change start - Kappa HttpApi groups
import { AgentBuilderApi } from "@/kappacode/server/httpapi/groups/agent-builder"
import { BranchNameApi } from "@/kappacode/server/httpapi/groups/branch-name"
import { CommitMessageApi } from "@/kappacode/server/httpapi/groups/commit-message"
import { BackgroundProcessApi } from "@/kappacode/server/httpapi/groups/background-process"
import { ConfigConsoleApi } from "@/kappacode/server/httpapi/groups/config-console"
import { EnhancePromptApi } from "@/kappacode/server/httpapi/groups/enhance-prompt"
import { IndexingApi } from "@/kappacode/server/httpapi/groups/indexing"
import { InstanceReloadApi } from "@/kappacode/server/httpapi/groups/instance-reload"
import { KappaGatewayApi } from "@/kappacode/server/httpapi/groups/kappa-gateway"
import { KappacodeApi } from "@/kappacode/server/httpapi/groups/kappacode"
import { MigrateApi } from "@/kappacode/server/httpapi/groups/migrate"
import { NetworkApi } from "@/kappacode/server/httpapi/groups/network"
import { RemoteApi } from "@/kappacode/server/httpapi/groups/remote"
import { SandboxApi } from "@/kappacode/server/httpapi/groups/sandbox"
import { SessionImportApi } from "@/kappacode/server/httpapi/groups/session-import"
import { SuggestionApi } from "@/kappacode/server/httpapi/groups/suggestion"
import { TelemetryApi } from "@/kappacode/server/httpapi/groups/telemetry"
import { MemoryApi } from "@/kappacode/server/httpapi/groups/memory" // kappacode_change
// kappacode_change end
import { makeApi } from "@opencode-ai/protocol/api"
import { LocationMiddleware } from "@opencode-ai/server/location"
import { SessionLocationMiddleware } from "@opencode-ai/server/middleware/session-location"
import { GlobalApi } from "./groups/global"
import { Authorization } from "./middleware/authorization"
import { SchemaErrorMiddleware } from "./middleware/schema-error"

const EventSchema = Schema.Union([
  ...EventManifest.Latest.values()
    .map((definition) =>
      Schema.Struct({
        id: EventV2.ID,
        type: Schema.Literal(definition.type),
        properties: definition.data,
      }).annotate({ identifier: `Event.${definition.type}` }),
    )
    .toArray(),
  ...BusEvent.effectPayloads(), // kappacode_change - include legacy Kappa events until they migrate to EventV2
  InstanceDisposed,
]).annotate({ identifier: "Event" })

export const ServerApi = makeApi({
  definitions: EventManifest.Latest.values().toArray(),
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

export const RootHttpApi = HttpApi.make("opencode-root")
  .addHttpApi(ControlApi)
  .addHttpApi(ControlPlaneApi)
  .addHttpApi(GlobalApi)
  .middleware(SchemaErrorMiddleware)
  .middleware(Authorization)

export const InstanceHttpApi = HttpApi.make("opencode-instance")
  .addHttpApi(ConfigApi)
  .addHttpApi(ExperimentalApi)
  .addHttpApi(FileApi)
  .addHttpApi(InstanceApi)
  .addHttpApi(McpApi)
  .addHttpApi(ProjectApi)
  .addHttpApi(ProjectCopyApi)
  .addHttpApi(PtyApi)
  .addHttpApi(QuestionApi)
  .addHttpApi(PermissionApi)
  .addHttpApi(ProviderApi)
  .addHttpApi(SessionApi)
  .addHttpApi(SyncApi)
  .addHttpApi(TuiApi)
  .addHttpApi(WorkspaceApi)
  // kappacode_change start - Kappa HttpApi groups
  .addHttpApi(AgentBuilderApi)
  .addHttpApi(BackgroundProcessApi)
  .addHttpApi(BranchNameApi)
  .addHttpApi(CommitMessageApi)
  .addHttpApi(ConfigConsoleApi)
  .addHttpApi(EnhancePromptApi)
  .addHttpApi(IndexingApi)
  .addHttpApi(InstanceReloadApi)
  .addHttpApi(KappaGatewayApi)
  .addHttpApi(KappacodeApi)
  .addHttpApi(MigrateApi)
  .addHttpApi(NetworkApi)
  .addHttpApi(RemoteApi)
  .addHttpApi(SandboxApi)
  .addHttpApi(SessionImportApi)
  .addHttpApi(SuggestionApi)
  .addHttpApi(TelemetryApi)
  .addHttpApi(MemoryApi)
  // kappacode_change end
  .middleware(SchemaErrorMiddleware)

export const OpenCodeHttpApi = HttpApi.make("opencode")
  .addHttpApi(RootHttpApi)
  .addHttpApi(EventApi)
  .addHttpApi(InstanceHttpApi)
  .addHttpApi(ServerApi)
  .addHttpApi(PtyConnectApi)
  .annotate(HttpApi.AdditionalSchemas, [
    EventSchema,
    Question.Replied,
    Question.Rejected,
    Credential.Value,
    Integration.Inputs,
    Integration.Method,
    Integration.Ref,
    SkillV2.Source,
  ])

export type RootHttpApiType = typeof RootHttpApi
export type InstanceHttpApiType = typeof InstanceHttpApi
