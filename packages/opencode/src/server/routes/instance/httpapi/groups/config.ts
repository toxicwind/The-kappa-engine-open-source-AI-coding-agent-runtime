import { Config } from "@/config/config"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { Provider } from "@/provider/provider"
import { Schema } from "effect" // kappacode_change
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization.ts"
import { InstanceContextMiddleware } from "../middleware/instance-context.ts"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing.ts"
import { described } from "./metadata.ts"

const root = "/config"

// kappacode_change start
const Warning = Schema.Struct({
  path: Schema.String,
  message: Schema.String,
  detail: Schema.optional(Schema.String),
})
// kappacode_change end

export const ConfigApi = HttpApi.make("config")
  .add(
    HttpApiGroup.make("config")
      .add(
        HttpApiEndpoint.get("get", root, {
          query: WorkspaceRoutingQuery,
          success: described(ConfigV1.Info, "Get config info"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.get",
            summary: "Get configuration",
            description: "Retrieve the current Kappa configuration settings and preferences.", // kappacode_change
          }),
        ),
        HttpApiEndpoint.patch("update", root, {
          query: WorkspaceRoutingQuery,
          payload: ConfigV1.Info,
          success: described(ConfigV1.Info, "Successfully updated config"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.update",
            summary: "Update configuration",
            description: "Update Kappa configuration settings and preferences.", // kappacode_change
          }),
        ),
        // kappacode_change start
        HttpApiEndpoint.get("warnings", `${root}/warnings`, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Warning), "Config warnings"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.warnings",
            summary: "Get config warnings",
            description: "Get warnings generated during config loading (e.g., invalid JSON, schema errors).",
          }),
        ),
        // kappacode_change end
        HttpApiEndpoint.get("providers", `${root}/providers`, {
          query: WorkspaceRoutingQuery,
          success: described(Provider.ConfigProvidersResult, "List of providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "config.providers",
            summary: "List config providers",
            description: "Get a list of all configured AI providers and their default models.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "config",
          description: "Experimental HttpApi config routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
