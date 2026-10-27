import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/http-api"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
} from "@/server/routes/instance/httpapi/middleware/workspace-routing"
import { described } from "@/server/routes/instance/httpapi/groups/metadata"

// Routes for migrating work into Kappa from another coding agent. Today that is
// Claude Code / OpenAI Codex session transcripts; the `migrate` group is the
// home for any future "bring your existing X into Kappa" route.
const root = "/kappacode/migrate/sessions"

export const MigrateSessionsPayload = Schema.Struct({
  cwd: Schema.optional(Schema.String).annotate({
    description: "Directory whose external sessions to migrate. Defaults to the current instance directory.",
  }),
  formats: Schema.optional(Schema.Array(Schema.Literals(["claude", "codex"]))).annotate({
    description: "Transcript formats to consider. Defaults to both.",
  }),
  ids: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Only migrate these discovered source session IDs. Omit to migrate every discovered session. Unknown IDs fail the request.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent name to attribute the migrated messages to. Defaults to the default agent.",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: "Model reference (providerID/modelID). Defaults to the agent or provider default.",
  }),
  force: Schema.optional(Schema.Boolean).annotate({
    description: "Migrate sources again even if they already landed, creating additional Kappa sessions.",
  }),
})

const MigrateSessionsMigrated = Schema.Struct({
  id: Schema.String.annotate({ description: "Source session UUID." }),
  format: Schema.Literals(["claude", "codex"]).annotate({ description: "Source transcript format." }),
  sessionID: Schema.optional(Schema.String).annotate({
    description: "Kappa session holding the transcript. Absent only when the migration failed.",
  }),
  messageID: Schema.optional(Schema.String).annotate({
    description: "Final assistant message written, when this call performed the migration.",
  }),
  messages: Schema.optional(Schema.Finite).annotate({
    description: "Number of messages written, when this call performed the migration.",
  }),
  skipped: Schema.Boolean.annotate({
    description: "True when the source had already been migrated and this call did nothing.",
  }),
  error: Schema.optional(Schema.String).annotate({ description: "Why this source could not be migrated." }),
  dropped: Schema.Array(Schema.String).annotate({
    description: "Human-readable reasons for content that could not be migrated.",
  }),
}).annotate({ identifier: "KappacodeMigrateSessionsMigrated" })

const MigrateSessionsResult = Schema.Struct({
  sessions: Schema.Array(MigrateSessionsMigrated).annotate({
    description: "Per-source outcomes, most recently modified source first.",
  }),
  migrated: Schema.Finite.annotate({ description: "Number of sources migrated by this call." }),
  skipped: Schema.Finite.annotate({
    description: "Number of sources skipped because they had already been migrated.",
  }),
  dropped: Schema.Array(Schema.String).annotate({
    description: "Reasons transcripts were found but could not be previewed or migrated.",
  }),
}).annotate({ identifier: "KappacodeMigrateSessionsResult" })

const MigrateSessionsModel = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
}).annotate({ identifier: "KappacodeMigrateSessionsModel" })

export const MigrateSessionsDiscoverPayload = Schema.Struct({
  cwd: Schema.optional(Schema.String).annotate({
    description: "Directory whose external sessions to enumerate. Defaults to the current instance directory.",
  }),
  formats: Schema.optional(Schema.Array(Schema.Literals(["claude", "codex"]))).annotate({
    description: "Transcript formats to enumerate. Defaults to both.",
  }),
})

const MigrateSessionsDiscovered = Schema.Struct({
  id: Schema.String.annotate({ description: "Session UUID parsed from the transcript filename." }),
  format: Schema.Literals(["claude", "codex"]).annotate({ description: "Detected transcript format." }),
  path: Schema.String.annotate({ description: "Absolute path to the JSONL transcript on the CLI host." }),
  mtime: Schema.Finite.annotate({ description: "Last-modified time (epoch ms)." }),
  version: Schema.Finite.annotate({ description: "Source harness major version." }),
  title: Schema.optional(Schema.String).annotate({ description: "First user message text (single line, clamped)." }),
  messages: Schema.Finite.annotate({ description: "Number of user + assistant steps in the transcript." }),
  model: Schema.optional(MigrateSessionsModel).annotate({
    description: "Source model reference, if the transcript records one.",
  }),
  sessionID: Schema.optional(Schema.String).annotate({
    description:
      "Kappa session this transcript was already migrated into. Present means a migration would skip this source.",
  }),
}).annotate({ identifier: "KappacodeMigrateSessionsDiscovered" })

const MigrateSessionsDiscoverResult = Schema.Struct({
  sessions: Schema.Array(MigrateSessionsDiscovered).annotate({
    description: "Discovered migratable sessions, most recently modified first.",
  }),
  dropped: Schema.Array(Schema.String).annotate({
    description: "Human-readable reasons for transcripts that were found but could not be previewed.",
  }),
}).annotate({ identifier: "KappacodeMigrateSessionsDiscoverResult" })

export class MigrateFailedError extends Schema.Error<MigrateFailedError>("MigrateFailedError")(
  { message: Schema.String },
  { httpApiStatus: 422 },
) {}

export const MigrateApi = HttpApi.make("migrate").add(
  HttpApiGroup.make("migrate")
    .add(
      HttpApiEndpoint.post("sessions", root, {
        query: WorkspaceRoutingQuery,
        payload: MigrateSessionsPayload,
        success: described(MigrateSessionsResult, "Session migration result"),
        error: [HttpApiError.BadRequest, MigrateFailedError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "kappacode.migrate.sessions",
          summary: "Migrate external sessions into Kappa",
          description:
            "Discover Claude Code and OpenAI Codex JSONL transcripts for a directory and migrate them into new Kappa sessions, one session per transcript. Sources that were already migrated are skipped, so calling this repeatedly is a no-op once everything has landed.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("discover", `${root}/discover`, {
        query: WorkspaceRoutingQuery,
        payload: MigrateSessionsDiscoverPayload,
        success: described(MigrateSessionsDiscoverResult, "Discovered migratable sessions"),
        error: [HttpApiError.BadRequest, MigrateFailedError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "kappacode.migrate.discover",
          summary: "Discover migratable external session transcripts",
          description:
            "Enumerate Claude Code and OpenAI Codex JSONL transcripts for a directory and preview each, marking the ones already migrated, so callers can render a picker before migrating. Read-only; writes nothing.",
        }),
      ),
    )
    .annotateMerge(
      OpenApi.annotations({
        title: "migrate",
        description: "Kappa routes for migrating sessions from other coding agents into Kappa.",
      }),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
