import { Layer } from "effect"
import { FetchHttpClient, HttpMiddleware, HttpRouter, HttpServer } from "effect/unstable/http"
import { CorsConfig, isAllowedCorsOrigin, type CorsOptions } from "@opencode-ai/server/cors"
import { compressionLayer } from "@/server/routes/instance/httpapi/middleware/compression"
import { corsVaryFix } from "@/server/routes/instance/httpapi/middleware/cors-vary"
import { errorLayer } from "@/server/routes/instance/httpapi/middleware/error"
import { fenceLayer } from "@/server/routes/instance/httpapi/middleware/fence"
import * as AnacondaDesktop from "@/kappacode/anaconda-desktop/service"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1" // kappacode_change - defaultLayer aliases are gone

import { KappaViewers } from "@/kappacode/presence/service" // kappacode_change
import { agentBuilderHandlers } from "./handlers/agent-builder.ts"
import { anacondaDesktopHandlers } from "./handlers/anaconda-desktop.ts"
import { backgroundProcessHandlers } from "./handlers/background-process.ts"
import { branchNameHandlers } from "./handlers/branch-name.ts"
import { commitMessageHandlers } from "./handlers/commit-message.ts"
import { configConsoleHandlers } from "./handlers/config-console.ts"
import { enhancePromptHandlers } from "./handlers/enhance-prompt.ts"
import { indexingHandlers } from "./handlers/indexing.ts"
import { instanceReloadHandlers } from "./handlers/instance-reload.ts"
import { kappaGatewayHandlers } from "./handlers/kappa-gateway.ts"
import { kappacodeHandlers } from "./handlers/kappacode.ts"
import { memoryHandlers } from "./handlers/memory.ts"
import { migrateHandlers } from "./handlers/migrate.ts"
import { networkHandlers } from "./handlers/network.ts"
import { remoteHandlers } from "./handlers/remote.ts"
import { sandboxHandlers } from "./handlers/sandbox.ts"
import { sessionImportHandlers } from "./handlers/session-import.ts"
import { suggestionHandlers } from "./handlers/suggestion.ts"
import { telemetryHandlers } from "./handlers/telemetry.ts"

export const provide = Layer.provide([
  agentBuilderHandlers,
  anacondaDesktopHandlers.pipe(Layer.provide(AnacondaDesktop.liveLayer)),
  backgroundProcessHandlers,
  branchNameHandlers,
  commitMessageHandlers,
  configConsoleHandlers,
  enhancePromptHandlers,
  indexingHandlers,
  instanceReloadHandlers,
  kappaGatewayHandlers,
  kappacodeHandlers,
  memoryHandlers,
  migrateHandlers,
  networkHandlers,
  remoteHandlers,
  sandboxHandlers,
  sessionImportHandlers,
  suggestionHandlers,
  telemetryHandlers,
])

export function provideListener(opts?: CorsOptions) {
  const cors = HttpRouter.middleware(
    HttpMiddleware.cors({
      allowedOrigins: (origin) => isAllowedCorsOrigin(origin, opts),
      maxAge: 86_400,
    }),
    { global: true },
  )
  return Layer.provide([
    errorLayer,
    compressionLayer,
    corsVaryFix,
    fenceLayer,
    cors,
    KappaViewers.defaultLayer, // kappacode_change
    AppNodeBuilderV1.build(EffectFlock.node),
    FetchHttpClient.layer,
    HttpServer.layerServices,
    Layer.succeed(CorsConfig)(opts),
  ])
}
