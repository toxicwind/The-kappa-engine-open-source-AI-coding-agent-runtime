import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { llmClient } from "@opencode-ai/core/effect/app-node-platform"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Provider } from "@/provider/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Log } from "@opencode-ai/core/util/log" // kappacode_change
import { Context, Effect, Layer } from "effect"
import * as Stream from "effect/Stream"
import { streamText, wrapLanguageModel, type ModelMessage, type Tool } from "ai"
import type { LLMEvent } from "@opencode-ai/llm"
import { LLMClient } from "@opencode-ai/llm/route"
import type { LLMClientService } from "@opencode-ai/llm/route"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2.ts"
import { usable } from "./overflow.ts" // kappacode_change
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Wildcard } from "@/util/wildcard"
import { SessionID } from "@/session/schema"
import { Auth } from "@/auth"
// kappacode_change start
import { InstanceState } from "@/effect/instance-state"
import { KappaSession } from "@/kappacode/session"
import { KappaLLM } from "@/kappacode/session/llm"
import { KappaSessionOverflow } from "@/kappacode/session/overflow"
import { KappaToolSchema } from "@/kappacode/session/tool-schema"
import { KappaMessageDiagnostics } from "@/kappacode/session/message-diagnostics"
import { SessionExport } from "@/kappacode/session-export"
import { getActiveOrg } from "@/kappacode/session-export/eligibility"
import { normalizeUsageForExport, observeFullStreamForExport } from "@/kappacode/session-export/llm"
// kappacode_change end
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LLMAISDK } from "./llm/ai-sdk.ts"
import { LLMNativeRuntime } from "./llm/native-runtime.ts"
import { LLMRequestPrep } from "./llm/request.ts"
// kilocode_change start - per-provider concurrency queue shared by the provider as a whole
import { LLMQueue, node as LLMQueueNode } from "@/kappacode/session/llm/queue"
// kilocode_change end

const log = Log.create({ service: "llm" }) // kappacode_change

export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

export type StreamInput = {
  user: SessionV1.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: PermissionV1.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
  preflight?: boolean // kappacode_change - enable proactive threshold compaction for normal session turns
  reportedContextTokens?: number // kappacode_change - provider-reported context size from the last finished turn, source of truth for the output cap
}

export type StreamRequest = StreamInput & {
  abort: AbortSignal
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

export const use = serviceUse(Service)

const live: Layer.Layer<
  Service,
  never,
  | Auth.Service
  | Config.Service
  | Provider.Service
  | Plugin.Service
  | Permission.Service
  | EventV2Bridge.Service
  | LLMClientService
  | RuntimeFlags.Service
  | LLMQueue
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const perm = yield* Permission.Service
    const events = yield* EventV2Bridge.Service
    const llmClient = yield* LLMClient.Service
    const flags = yield* RuntimeFlags.Service
    // kilocode_change start - provider-wide per-provider concurrency queue
    const queue = yield* LLMQueue
    // kilocode_change end

    const run = Effect.fn("LLM.run")(function* (input: StreamRequest) {
      const l = log.clone().tag("providerID", input.model.providerID).tag("modelID", input.model.id) // kappacode_change
      yield* Effect.logInfo("stream", {
        providerID: input.model.providerID,
        modelID: input.model.id,
        "session.id": input.sessionID,
        small: (input.small ?? false).toString(),
        agent: input.agent.name,
        mode: input.agent.mode,
      })

      const [language, cfg, item, info] = yield* Effect.all(
        [
          provider.getLanguage(input.model),
          config.get(),
          provider.getProvider(input.model.providerID),
          auth.get(input.model.providerID),
        ],
        { concurrency: "unbounded" },
      )
      const isWorkflow = language instanceof GitLabWorkflowLanguageModel
      const base = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow,
      })

      // kappacode_change start - compact at the configured threshold before contacting the provider
      const tools = yield* Effect.promise(() => KappaToolSchema.sanitize(base.tools))
      const isOpenaiOauth = item.id === "openai" && info?.type === "oauth"
      const estimated: ModelMessage[] =
        isOpenaiOauth || isWorkflow
          ? [
              {
                role: "system",
                content: isOpenaiOauth ? String(base.params.options.instructions ?? "") : base.system.join("\n"),
              },
              ...base.messages,
            ]
          : base.messages
      const preflight = input.preflight === true && KappaSessionOverflow.enabled({ cfg, model: input.model })
      const cap = KappaLLM.needsEstimate({ model: input.model, configured: base.params.maxOutputTokens })
      const usage = cap || preflight ? KappaSessionOverflow.measure({ messages: estimated, tools }) : undefined
      const maxOutputTokens = KappaLLM.capOutputTokens({
        model: input.model,
        messages: estimated,
        tools,
        configured: base.params.maxOutputTokens,
        usage,
        reported: input.reportedContextTokens,
      })
      if (
        preflight &&
        usage &&
        KappaSessionOverflow.shouldCompact({
          cfg,
          model: input.model,
          usable: usable({ cfg, model: input.model, outputTokenMax: flags.outputTokenMax }), // kappacode_change
          tokens: usage.normalized,
          tail: usage.tail,
          overhead: usage.overhead,
          continuation: usage.continuation,
          reported: input.reportedContextTokens,
        })
      ) {
        return yield* Effect.fail(new KappaSessionOverflow.PreflightError())
      }
      const prepared = { ...base, tools, params: { ...base.params, maxOutputTokens } }
      // kappacode_change end

      // Wire up toolExecutor for DWS workflow models so that tool calls
      // from the workflow service are executed via opencode's tool system
      // and results sent back over the WebSocket.
      const bridge = yield* EffectBridge.make()
      if (language instanceof GitLabWorkflowLanguageModel) {
        const workflowModel = language as GitLabWorkflowLanguageModel & {
          sessionID?: string
          sessionPreapprovedTools?: string[]
          approvalHandler?: (approvalTools: { name: string; args: string }[]) => Promise<{ approved: boolean }>
        }
        workflowModel.sessionID = input.sessionID
        workflowModel.systemPrompt = prepared.system.join("\n")
        workflowModel.toolExecutor = async (toolName, argsJson, _requestID) => {
          const t = prepared.tools[toolName]
          if (!t || !t.execute) {
            return { result: "", error: `Unknown tool: ${toolName}` }
          }
          try {
            const result = await t.execute!(JSON.parse(argsJson), {
              toolCallId: _requestID,
              messages: input.messages,
              abortSignal: input.abort,
            })
            const output = typeof result === "string" ? result : (result?.output ?? JSON.stringify(result))
            return {
              result: output,
              metadata: typeof result === "object" ? result?.metadata : undefined,
              title: typeof result === "object" ? result?.title : undefined,
            }
          } catch (e: any) {
            return { result: "", error: e.message ?? String(e) }
          }
        }

        const ruleset = Permission.merge(input.agent.permission ?? [], input.permission ?? [])
        workflowModel.sessionPreapprovedTools = Object.keys(prepared.tools).filter((name) => {
          const match = ruleset.findLast((rule) => Wildcard.match(name, rule.permission))
          return !match || match.action !== "ask"
        })

        const approvedToolsForSession = new Set<string>()
        workflowModel.approvalHandler = bridge.bind(async (approvalTools) => {
          const uniqueNames = [...new Set(approvalTools.map((t: { name: string }) => t.name))] as string[]
          // Auto-approve tools that were already approved in this session
          // (prevents infinite approval loops for server-side MCP tools)
          if (uniqueNames.every((name) => approvedToolsForSession.has(name))) {
            return { approved: true }
          }

          const id = PermissionV1.ID.ascending()
          let unsub: EventV2.Unsubscribe | undefined
          try {
            unsub = await bridge.promise(
              events.listen((event) => {
                if (event.type !== Permission.Event.Replied.type) return Effect.void
                const data = event.data as EventV2.Data<typeof Permission.Event.Replied>
                if (data.requestID !== id) return Effect.void
                void data.reply
                return Effect.void
              }),
            )
            const toolPatterns = approvalTools.map((t: { name: string; args: string }) => {
              try {
                const parsed = JSON.parse(t.args) as Record<string, unknown>
                const title = (parsed?.title ?? parsed?.name ?? "") as string
                return title ? `${t.name}: ${title}` : t.name
              } catch {
                return t.name
              }
            })
            const uniquePatterns = [...new Set(toolPatterns)] as string[]
            await bridge.promise(
              perm.ask({
                id,
                sessionID: SessionID.make(input.sessionID),
                permission: "workflow_tool_approval",
                patterns: uniquePatterns,
                metadata: { tools: approvalTools },
                always: uniquePatterns,
                ruleset: [],
              }),
            )
            for (const name of uniqueNames) approvedToolsForSession.add(name)
            workflowModel.sessionPreapprovedTools = [...(workflowModel.sessionPreapprovedTools ?? []), ...uniqueNames]
            return { approved: true }
          } catch {
            return { approved: false }
          } finally {
            if (unsub) await bridge.promise(unsub)
          }
        })
      }

      const instance = yield* InstanceState.context
      // kappacode_change start - capture eligible session export request start
      const isKappa = input.model.api.npm === "@kappacode/kappa-gateway"
      const exporting = SessionExport.enabled
      const org = yield* exporting && isKappa && input.model.isFree === true
        ? Effect.promise(() => getActiveOrg())
        : Effect.succeed({ type: "unknown" as const })
      const started = Date.now()
      const parent = input.parentSessionID ?? KappaSession.resolveParent(input.sessionID)
      const found = KappaSession.resolveRoot(input.sessionID)
      const root = parent ? (found === input.sessionID ? parent : found) : input.sessionID
      const exportable =
        exporting && isKappa && input.model.isFree === true && org.type === "personal" && input.agent.name !== "title"
      if (exportable) {
        SessionExport.beforeRequest({
          input: { model: input.model, org },
          requestMeta: {
            sessionId: input.sessionID,
            rootSessionId: root,
            parentSessionId: parent,
            requestId: input.user.id,
            userMessageId: input.user.id,
            agent: input.agent.name,
            modeId: input.agent.mode,
            workspaceKey: instance.directory,
            agentInfo: SessionExport.agentInfo(input.agent),
          },
          assembled: {
            system: prepared.system,
            messages: prepared.messages,
            tools: prepared.tools,
            permissions: input.permission ?? [],
            toolChoice: input.toolChoice,
            params: prepared.params,
          },
        })
      }
      // kappacode_change end

      // Runtime seam: native is an opt-in adapter over @opencode-ai/llm. It
      // either returns a ready LLMEvent stream or a concrete fallback reason.
      if (flags.experimentalNativeLlm) {
        const native = LLMNativeRuntime.stream({
          model: input.model,
          provider: item,
          auth: info,
          llmClient,
          messages: prepared.messages,
          tools: prepared.tools,
          toolChoice: input.toolChoice,
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          // kappacode_change start
          maxOutputTokens: ProviderTransform.maxOutputTokensForRequest({
            model: input.model,
            options: prepared.params.options,
            maxOutputTokens: prepared.params.maxOutputTokens,
          }),
          // kappacode_change end
          providerOptions: prepared.params.options,
          messageTransformOptions: prepared.messageTransformOptions, // kappacode_change
          headers: prepared.headers,
          abort: input.abort,
        })
        if (native.type === "supported") {
          yield* Effect.logInfo("llm runtime selected", {
            "llm.runtime": "native",
            "llm.provider": input.model.providerID,
            "llm.model": input.model.id,
          })
          return {
            type: "native" as const,
            stream: native.stream,
          }
        }
        yield* Effect.logInfo("llm runtime selected", {
          "llm.runtime": "ai-sdk",
          "llm.provider": input.model.providerID,
          "llm.model": input.model.id,
          "llm.native_unsupported_reason": native.reason,
        })
        yield* Effect.logInfo("native runtime unavailable; falling back to ai-sdk", {
          providerID: input.model.providerID,
          modelID: input.model.id,
          "session.id": input.sessionID,
          small: (input.small ?? false).toString(),
          agent: input.agent.name,
          mode: input.agent.mode,
          reason: native.reason,
        })
      }

      yield* Effect.logInfo("llm runtime selected", {
        "llm.runtime": "ai-sdk",
        "llm.provider": input.model.providerID,
        "llm.model": input.model.id,
      })
      // Default runtime path: AI SDK owns provider execution and tool dispatch;
      // LLMAISDK.toLLMEvents below normalizes fullStream parts for the processor.
      const result = streamText({
        onError(error) {
          bridge.fork(
            Effect.logError("stream error", {
              providerID: input.model.providerID,
              modelID: input.model.id,
              "session.id": input.sessionID,
              small: (input.small ?? false).toString(),
              agent: input.agent.name,
              mode: input.agent.mode,
              error,
            }),
          )
        },
        // Copilot returns the authoritative billed amount only in provider-specific response fields.
        includeRawChunks: input.model.providerID.includes("github-copilot"),
        async experimental_repairToolCall(failed) {
          const lower = failed.toolCall.toolName.trim().toLowerCase() // kappacode_change
          if (lower !== failed.toolCall.toolName && prepared.tools[lower]) {
            l.info("repairing tool call", { tool: failed.toolCall.toolName, repaired: lower }) // kappacode_change
            return { ...failed.toolCall, toolName: lower }
          }
          // kappacode_change start - surface the original tool-name error instead of a
          // repaired call to the hidden "invalid" tool, which activeTools excludes and
          // therefore fails with a confusing "unavailable tool 'invalid'" error
          return null
          // kappacode_change end
        },
        temperature: prepared.params.temperature,
        topP: prepared.params.topP,
        topK: prepared.params.topK,
        providerOptions: ProviderTransform.providerOptions(input.model, prepared.params.options),
        activeTools: Object.keys(prepared.tools).filter((x) => x !== "invalid"),
        // kappacode_change start
        tools: prepared.tools,
        toolChoice: input.toolChoice,
        maxOutputTokens: ProviderTransform.maxOutputTokensForRequest({
          model: input.model,
          options: prepared.params.options,
          maxOutputTokens: prepared.params.maxOutputTokens,
        }),
        // kappacode_change end
        abortSignal: input.abort,
        ...KappaLLM.timeout({ options: prepared.params.options, fallback: item.options, log: l }), // kappacode_change
        headers: prepared.headers,
        maxRetries: input.retries ?? 0,
        allowSystemInMessages: true, // kappacode_change - system prompts are trusted and intentionally included in messages
        messages: prepared.messages,
        model: wrapLanguageModel({
          model: language,
          middleware: [
            {
              specificationVersion: "v3" as const,
              async transformParams(args) {
                if (args.type === "stream") {
                  // @ts-expect-error
                  args.params.prompt = ProviderTransform.message(
                    args.params.prompt,
                    input.model,
                    prepared.messageTransformOptions,
                  )
                }
                return args.params
              },
            },
          ],
        }),
        // kappacode_change start - disable AI SDK span recording (ai.* / gen_ai.*)
        experimental_telemetry: { isEnabled: false },
      })
      // kappacode_change end
      // kappacode_change start - capture eligible session export request completion off the stream path
      if (!exportable) return { type: "ai-sdk" as const, result, messages: prepared.messages }
      return {
        type: "ai-sdk" as const,
        result: {
          fullStream: observeFullStreamForExport(result.fullStream, {
            sessionId: input.sessionID,
            rootSessionId: root,
            parentSessionId: parent,
            requestId: input.user.id,
            workspaceKey: instance.directory,
            started,
            retries: input.retries ?? 0,
          }),
        },
        messages: prepared.messages,
      }
      // kappacode_change end
    })

    const stream: Interface["stream"] = (input) =>
      // kilocode_change start - hold ONE provider-wide concurrency permit for the
      // whole stream; same-provider streams (all freeinference models, incl.
      // subagent turns) line up on a single queue instead of tripping the local
      // Thresher shed that reads as 429.
      Stream.scoped(
        Stream.unwrap(
          Effect.acquireRelease(queue.acquire(input.model.providerID), () => queue.release(input.model.providerID)).pipe(
            Effect.map(() =>
              Stream.unwrap(
                Effect.gen(function* () {
                  const ctrl = yield* Effect.acquireRelease(
                    Effect.sync(() => new AbortController()),
                    (ctrl) => Effect.sync(() => ctrl.abort()),
                  )

                  const result = yield* run({ ...input, abort: ctrl.signal })

                  if (result.type === "native") return result.stream

                  // Adapter seam: both runtimes expose the same LLMEvent stream. Native
                  // already returns one; AI SDK streams are converted here.
                  const state = LLMAISDK.adapterState()
                  return Stream.fromAsyncIterable(result.result.fullStream, (e) =>
                    e instanceof Error ? e : new Error(String(e)),
                  ).pipe(
                    Stream.mapEffect((event) => LLMAISDK.toLLMEvents(state, event)),
                    // kappacode_change start - emit structural diagnostics when the AI SDK
                    // rejects the assembled ModelMessage[] before dispatch (#13185)
                    Stream.tapError((e) =>
                      Effect.sync(() => KappaMessageDiagnostics.reportModelMessageError(e, result.messages)),
                    ),
                    // kappacode_change end
                    Stream.flatMap((events) => Stream.fromIterable(events)),
                  )
                }),
              ),
            ),
          ),
        ),
      )
    // kilocode_change end

    return Service.of({ stream })
  }),
)

// kappacode_change start - session export stream observer
export { normalizeUsageForExport, observeFullStreamForExport }
// kappacode_change end
export const hasToolCalls = LLMRequestPrep.hasToolCalls

export const node = LayerNode.make({
  service: Service,
  layer: live,
  deps: [
    Auth.node,
    Config.node,
    Provider.node,
    Plugin.node,
    Permission.node,
    EventV2Bridge.node,
    llmClient,
    RuntimeFlags.node,
    // kilocode_change start - provider-wide per-provider concurrency queue
    LLMQueueNode,
    // kilocode_change end
  ],
})

export * as LLM from "./llm.ts"
