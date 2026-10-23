export * as BackgroundJobTool from "./background-job"

import { Effect, Layer, Schema } from "effect"
import { BackgroundJob } from "../background-job"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "background_job"

export const DEFAULT_WAIT_MS = 30_000
export const MAX_WAIT_MS = 10 * 60 * 1_000

const JobInfo = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  title: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "completed", "error", "cancelled"]),
  started_at: Schema.Number,
  completed_at: Schema.optional(Schema.Number),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
})

const StructuredOutput = Schema.Struct({
  ids: Schema.Array(Schema.String),
  status: Schema.optional(Schema.Literals(["running", "completed", "error", "cancelled", "unknown"])),
  timed_out: Schema.optional(Schema.Boolean),
})

const Output = Schema.Struct({
  ...StructuredOutput.fields,
  jobs: Schema.optional(Schema.Array(JobInfo)),
  output: Schema.String,
})

type Output = typeof Output.Type

const WaitGetCancel = Schema.Struct({
  action: Schema.Literals(["get", "wait", "cancel"]),
  id: Schema.String,
  timeout: Schema.optional(Schema.Number),
})

const List = Schema.Struct({
  action: Schema.Literals(["list"]),
})

const Input = Schema.Union([WaitGetCancel, List])

type Input = typeof Input.Type

const render = (info: BackgroundJob.Info) => {
  const head = `job ${info.id} type=${info.type} status=${info.status}${info.title ? ` title="${info.title}"` : ""}`
  const body = info.output ? `\n${info.output}` : info.error ? `\n(error: ${info.error})` : ""
  return `${head}${body}`
}

const modelOutput = (output: Output) => output.output

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const jobs = yield* BackgroundJob.Service

    yield* tools.register({
      [name]: Tool.make({
        description: `Observe and settle kappa background jobs. A bash command that exceeded its deadline was auto-backgrounded into one of these jobs; wait delivers its full output on completion (bounded by timeout, default ${DEFAULT_WAIT_MS} ms, max ${MAX_WAIT_MS}). get returns current status, cancel stops a running job, list shows every live job.`,
        input: Input,
        output: Output,
        structured: StructuredOutput,
        toStructuredOutput: ({ output }) => ({
          ids: (output.jobs ?? []).map((job) => job.id),
          ...(output.status === undefined ? {} : { status: output.status }),
          ...(output.timed_out === undefined ? {} : { timed_out: output.timed_out }),
        }),
        toModelOutput: ({ output }) => [{ type: "text", text: modelOutput(output) }],
        execute: (input) =>
          Effect.gen(function* () {
            if (input.action === "list") {
              const infos = yield* jobs.list()
              return {
                ids: infos.map((info) => info.id),
                jobs: infos,
                output: infos.length ? infos.map(render).join("\n") : "(no background jobs)",
              } satisfies Output
            }
            if (input.action === "get") {
              const info = yield* jobs.get(input.id)
              if (info === undefined)
                return { ids: [], status: "unknown" as const, output: `no such job: ${input.id}` } satisfies Output
              return { ids: [info.id], status: info.status, jobs: [info], output: render(info) } satisfies Output
            }
            if (input.action === "cancel") {
              const info = yield* jobs.cancel(input.id)
              if (info === undefined)
                return { ids: [], status: "unknown" as const, output: `no such job: ${input.id}` } satisfies Output
              return { ids: [info.id], status: info.status, jobs: [info], output: render(info) } satisfies Output
            }
            const waitMs = Math.min(Math.max(input.timeout ?? DEFAULT_WAIT_MS, 1), MAX_WAIT_MS)
            const waited = yield* jobs.wait({ id: input.id, timeout: waitMs })
            if (waited.timedOut) {
              const live = yield* jobs.get(input.id)
              return {
                ids: [input.id],
                ...(live ? { status: live.status, jobs: [live] } : {}),
                timed_out: true,
                output: `job ${input.id} still running after ${waitMs} ms — wait again to keep streaming toward completion (the job keeps running either way).`,
              } satisfies Output
            }
            const info = waited.info
            if (info === undefined)
              return { ids: [], status: "unknown" as const, output: `no such job: ${input.id}` } satisfies Output
            return { ids: [info.id], status: info.status, jobs: [info], output: render(info) } satisfies Output
          }),
      }),
    })
  }).pipe(Effect.orDie),
)

export const node = makeLocationNode({
  name: "tool/background_job",
  layer,
  deps: [ToolRegistry.node, BackgroundJob.node],
})
