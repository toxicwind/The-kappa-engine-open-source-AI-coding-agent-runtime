import { MessageV2 } from "./message-v2.ts"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionID, MessageID, PartID } from "./schema.ts"
import type { NotFoundError } from "@/storage/storage"
import { SessionCompaction } from "./compaction.ts"
import { SystemPrompt } from "./system.ts"
import { Instruction } from "./instruction.ts"
import { Plugin } from "../plugin/index.ts"
import { MAX_STEPS_PROMPT } from "@opencode-ai/core/session/runner/max-steps"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../mcp/index.ts"
import { Config } from "@/config/config"
import { SessionSummary } from "./summary.ts"
import { NamedError } from "@opencode-ai/core/util/error"
import { SessionProcessor } from "./processor.ts"
import { Permission } from "@/permission"
import { SessionStatus } from "./status.ts"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Truncate } from "@/tool/truncate"
import { Image } from "@/image/image"
import { Effect, Option, Scope } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { SessionRunState } from "./run-state.ts"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Database } from "@opencode-ai/core/database/database"
import { SessionTools } from "./tools.ts"
import { Agent } from "../agent/agent.ts"
import { Provider } from "@/provider/provider"
import { LSP } from "@/lsp/lsp"
import { Question } from "@/question"
import { KappaSessionProcessor } from "@/kappacode/session/processor"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { Session } from "./session.ts"
import { SessionDrain } from "@/kappacode/session/drain"
import { SessionReminders } from "./reminders.ts"
import { SessionRevert } from "./revert.ts"
import { KappaSession } from "@/kappacode/session"
import { KappaSessionTitle } from "@/kappacode/session/title"
import { KappaSessionPrompt } from "@/kappacode/session/prompt"
import { KappaSessionMessageOrder } from "@/kappacode/session/message-order"
import { KappaSessionContinuation } from "@/kappacode/session/continuation"
import { KappaSessionControl } from "@/kappacode/session/control"
import { SteeringConsumed } from "@/kappacode/session/steering-consumed"
import { Goal } from "@/kappacode/session/goal/runner"
import { GoalState } from "@/kappacode/session/goal/state"
import { KappaSessionPromptQueue } from "@/kappacode/session/prompt-queue"
import { KappaSessionOverflow } from "@/kappacode/session/overflow"
import type { LoopInput } from "./prompt.ts"
import { jsonSchema } from "ai"
import type { ProviderV2 } from "@opencode-ai/core/provider"
import type { ModelV2 } from "@opencode-ai/core/model"
import { BoardContext } from "@/kappacode/board/context"

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.`

export const REQUEST_PRUNE_BYTES = 1_250_000

function isOrphanedInterruptedTool(part: SessionV1.ToolPart) {
  return part.state.status === "error" && part.state.metadata?.interrupted === true
}

export const runLoop = (deps: unknown, input: LoopInput): Effect.Effect<MessageV2.WithParts, NotFoundError> =>
  Effect.fn("RunLoop.run")(function* (_deps: unknown, input: LoopInput) {
    const deps = _deps as {
      status: SessionStatus.Interface
      sessions: Session.Interface
      agents: Agent.Interface
      provider: Provider.Interface
      processor: SessionProcessor.Interface
      compaction: SessionCompaction.Interface
      plugin: Plugin.Interface
      config: Config.Interface
      permission: Permission.Interface
      question: Question.Interface
      fsys: FSUtil.Interface
      mcp: MCP.Interface
      lsp: LSP.Interface
      registry: ToolRegistry.Interface
      truncate: Truncate.Interface
      image: Image.Interface
      scope: Scope.Scope
      instruction: Instruction.Interface
      state: SessionRunState.Interface
      drain: SessionDrain.Interface
      revert: SessionRevert.Interface
      summary: SessionSummary.Interface
      sys: SystemPrompt.Interface
      events: EventV2.Interface
      flags: RuntimeFlags.Info
      database: Database.Interface
      control: typeof import("@/kappacode/session/control").KappaSessionControl
      goals: Goal.Ops
      closeReasons: Map<string, KappaSession.CloseReason>
      ops: (sessionID: SessionID) => Effect.Effect<TaskPromptOps>
      cancel: (sessionID: SessionID, scope?: KappaSessionControl.AbortScope) => Effect.Effect<void>
      resolvePromptParts: (
        template: string,
      ) => Effect.Effect<Array<{ type: string; text?: string; url?: string; filename?: string; mime?: string }>>
      currentModel: (
        sessionID: SessionID,
      ) => Effect.Effect<{ providerID: ProviderV2.ID; modelID: ModelV2.ID; variant?: string }>
      title: (input: {
        session: Session.Info
        history: SessionV1.WithParts[]
        providerID: ProviderV2.ID
        modelID: ModelV2.ID
      }) => Effect.Effect<void>
      handleSubtask: (input: {
        task: SessionV1.SubtaskPart
        model: Provider.Model
        lastUser: SessionV1.User
        sessionID: SessionID
        session: Session.Info
        msgs: SessionV1.WithParts[]
      }) => Effect.Effect<void>
      getModel: (providerID: ProviderV2.ID, modelID: ModelV2.ID, sessionID: SessionID) => Effect.Effect<Provider.Model>
      lastAssistant: (sessionID: SessionID) => Effect.Effect<MessageV2.WithParts>
    }
    const {
      status,
      sessions,
      agents,
      provider,
      processor,
      compaction,
      plugin,
      config,
      permission,
      question,
      fsys,
      mcp,
      lsp,
      registry,
      truncate,
      image,
      scope,
      instruction,
      state,
      drain,
      revert,
      summary,
      sys,
      events,
      flags,
      database,
      control,
      goals,
      closeReasons,
      ops,
      cancel,
      resolvePromptParts,
      currentModel,
      title,
      handleSubtask,
      getModel,
      lastAssistant,
    } = deps

    const sessionID = input.sessionID
    const envCache: KappaSessionPrompt.EnvCache = {}
    const memoryCache = KappaSessionPrompt.memoryCache()
    const board = BoardContext.cache()
    closeReasons.delete(sessionID)
    let compactionAttempts = 0
    const ctx = yield* InstanceState.context
    let structured: unknown
    let step = 0
    const session = yield* sessions.get(sessionID).pipe(Effect.orDie)

    yield* SteeringConsumed.confirm({ sessionID, config, flags, database })

    while (true) {
      yield* status.set(sessionID, { type: "busy" })
      yield* Effect.logInfo("loop", { "session.id": sessionID, step })

      let msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
        Effect.provideService(Database.Service, database),
      )
      msgs = KappaSessionPromptQueue.scope(sessionID, msgs)
      msgs = KappaSessionPrompt.trimBeforeLastSummary(msgs)

      const latest = KappaSessionMessageOrder.latest(msgs)
      const { user: lastUser, assistant: lastAssistantInfo, finished: lastFinished, tasks } = latest

      if (input.resume && step === 0 && KappaSessionContinuation.target(msgs) !== input.resume) break
      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

      const lastAssistantMsg = msgs.findLast(
        (msg) => msg.info.role === "assistant" && msg.info.id === lastAssistantInfo?.id,
      ) as MessageV2.WithParts | undefined
      const userBeforeAssistant =
        latest.userMessage &&
        latest.assistantMessage &&
        KappaSessionMessageOrder.compare(latest.userMessage, latest.assistantMessage) < 0
      const telemetry =
        KappaSessionProcessor.extractReviewTelemetry(
          msgs.findLast((m) => m.info.role === "user" && m.info.id === lastUser.id)?.parts ?? [],
        ) ?? KappaSessionProcessor.extractSuggestionReviewTelemetry(lastAssistantMsg?.parts ?? [])

      const hasToolCalls =
        lastAssistantMsg?.parts.some(
          (part) =>
            part.type === "tool" &&
            !part.metadata?.providerExecuted &&
            !isOrphanedInterruptedTool(part as SessionV1.ToolPart),
        ) ?? false

      if (
        lastAssistantInfo?.finish &&
        hasToolCalls &&
        lastAssistantInfo.parentID === lastUser.id &&
        userBeforeAssistant &&
        KappaSessionPrompt.shouldAskPlanFollowup({ messages: msgs, abort: AbortSignal.any([]) })
      ) {
        const action = yield* Effect.promise((signal) =>
          KappaSessionPrompt.askPlanFollowup({ sessionID, messages: msgs, abort: signal, question }),
        )
        if (action === "continue") continue
        yield* Effect.logInfo("exiting loop", { "session.id": sessionID })
        break
      }

      if (
        lastAssistantInfo?.finish &&
        !["tool-calls"].includes(lastAssistantInfo.finish) &&
        lastAssistantInfo.id !== input.resume &&
        !hasToolCalls &&
        lastAssistantInfo.parentID === lastUser.id &&
        userBeforeAssistant
      ) {
        const orphan = lastAssistantMsg?.parts.find(
          (part) => part.type === "tool" && isOrphanedInterruptedTool(part as SessionV1.ToolPart),
        ) as SessionV1.ToolPart | undefined
        if (orphan) {
          yield* Effect.logWarning("loop exit with orphaned interrupted tool", {
            "session.id": sessionID,
            messageID: lastAssistantInfo.id,
            tool: orphan.tool,
            callID: orphan.callID,
          })
        }
        yield* Effect.logInfo("exiting loop", { "session.id": sessionID })
        break
      }

      step++

      const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
      const task = tasks.pop()

      if (task?.type === "subtask") {
        yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })
        continue
      }

      if (task?.type === "compaction") {
        const result = yield* compaction.process({
          messages: msgs,
          parentID: task.messageID,
          sessionID,
          auto: task.auto,
          overflow: task.overflow,
        })
        if (result === "stop") {
          closeReasons.set(sessionID, "error")
          break
        }
        continue
      }

      if (
        lastFinished &&
        lastFinished.summary !== true &&
        (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))
      ) {
        const guard = KappaSessionPrompt.guardCompactionAttempt({
          sessionID,
          attempts: compactionAttempts,
          closeReasons,
          message: lastFinished,
        })
        if (guard.exhausted) {
          yield* sessions.updateMessage(lastFinished)
          yield* events.publish(Session.Event.Error, { sessionID, error: guard.error })
          break
        }
        compactionAttempts++
        yield* compaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
          overflow: false,
        })
        continue
      }

      const agent = yield* agents.get(lastUser.agent)
      if (!agent) {
        const available = (yield* agents.list()).filter((a: Agent.Info) => !a.hidden).map((a: Agent.Info) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
        throw error
      }
      const maxSteps = agent.steps ?? Infinity
      const isLastStep = step >= maxSteps
      msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(
        Effect.provideService(RuntimeFlags.Service, flags),
        Effect.provideService(FSUtil.Service, fsys),
        Effect.provideService(Session.Service, sessions),
      )

      const msg: MessageV2.Assistant = {
        id: MessageID.ascending(),
        parentID: lastUser.id,
        role: "assistant",
        mode: agent.name,
        agent: agent.name,
        variant: lastUser.model.variant,
        path: { cwd: ctx.directory, root: ctx.worktree },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model.id,
        providerID: model.providerID,
        time: { created: Date.now() },
        sessionID,
      }
      yield* sessions.updateMessage(msg)
      const finalize = Effect.gen(function* () {
        if (msg.time.completed) return
        msg.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), {
          providerID: msg.providerID,
          aborted: true,
        })
        msg.time.completed = Date.now()
        yield* sessions.updateMessage(msg)
      })

      const handle = yield* processor
        .create({
          assistantMessage: msg,
          sessionID,
          model,
          telemetry,
          snapshotInitialization: input.snapshotInitialization,
        })
        .pipe(Effect.onInterrupt(() => finalize))

      const outcome: "break" | "continue" = yield* Effect.gen(function* () {
        const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
        const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false
        const promptOps = yield* ops(sessionID)

        const notify = BoardContext.allowed({ session, agent, user: lastUser })
          ? yield* BoardContext.notifier({ cache: board, session, agent, user: lastUser }).pipe(
              Effect.provideService(Config.Service, config),
              Effect.provideService(Database.Service, database),
              Effect.provideService(Agent.Service, agents),
              Effect.provideService(Session.Service, sessions),
              Effect.provideService(RuntimeFlags.Service, flags),
            )
          : undefined
        const tools = yield* SessionTools.resolve({
          agent,
          session,
          model,
          processor: handle,
          bypassAgentCheck,
          messages: msgs,
          promptOps,
          goalOps: goals,
          memoryCache,
          notify,
        }).pipe(
          Effect.provideService(Plugin.Service, plugin),
          Effect.provideService(Permission.Service, permission),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(ToolRegistry.Service, registry),
          Effect.provideService(MCP.Service, mcp),
          Effect.provideService(Truncate.Service, truncate),
          Effect.provideService(Config.Service, config),
          Effect.provideService(Provider.Service, provider),
          Effect.provideService(Database.Service, database),
          Effect.provideService(RuntimeFlags.Service, flags),
        )

        if (lastUser.format?.type === "json_schema") {
          tools["StructuredOutput"] = {
            description: STRUCTURED_OUTPUT_DESCRIPTION,
            inputSchema: jsonSchema(lastUser.format.schema),
            execute: async (args: unknown) => {
              structured = args
              return {
                output: "Structured output captured successfully.",
                title: "Structured Output",
                metadata: { valid: true },
              }
            },
            toModelOutput: ({ output }: { output: { output: string } }) => ({
              type: "text" as const,
              value: output.output,
            }),
          }
        }

        if (step === 1)
          yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))

        yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

        KappaSessionPrompt.injectEditorContext({ msgs, session, sessionID, cache: envCache })
        msgs = KappaSessionPrompt.maybeStripHistoricalMedia(msgs)

        const [skills, env, mem, instructions, mcpInstructions] = yield* Effect.all([
          sys.skills(agent),
          sys.environment(model, lastUser.editorContext),
          KappaSessionPrompt.memoryInject({ ctx, sessionID, record: step === 1, cache: memoryCache }),
          instruction.system().pipe(Effect.orDie),
          sys.mcp(agent, session.permission),
        ])
        let modelMsgs = yield* MessageV2.toModelMessagesEffect(msgs, model).pipe(
          Effect.provideService(Database.Service, database),
        )
        const size = Buffer.byteLength(JSON.stringify(modelMsgs))
        if (size > REQUEST_PRUNE_BYTES) {
          const cleared = yield* compaction.prune({ sessionID, reason: "payload-limit", messages: msgs })
          if (cleared > 0)
            modelMsgs = yield* MessageV2.toModelMessagesEffect(msgs, model).pipe(
              Effect.provideService(Database.Service, database),
            )
          const nextSize = cleared > 0 ? Buffer.byteLength(JSON.stringify(modelMsgs)) : size
          if (nextSize > REQUEST_PRUNE_BYTES)
            yield* Effect.logWarning("payload still large after pruning", { "session.id": sessionID, size: nextSize })
        }

        const system = [
          ...env,
          ...mem,
          ...(tools.board_read && notify ? [BoardContext.instructions] : []),
          ...instructions,
          ...(mcpInstructions ? [mcpInstructions] : []),
          ...(skills ? [skills] : []),
        ]
        const format = lastUser.format ?? { type: "text" as const }
        if (format.type === "json_schema") system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
        const result = yield* handle.process({
          user: lastUser,
          agent,
          permission: KappaSessionPrompt.guardPermissions({ agent, session }),
          sessionID,
          parentSessionID: session.parentID,
          system,
          messages: [
            ...modelMsgs,
            ...KappaSessionContinuation.context(!!input.resume && step === 1),
            ...(isLastStep ? [{ role: "user" as const, content: MAX_STEPS_PROMPT }] : []),
          ],
          tools,
          model,
          toolChoice: format.type === "json_schema" ? "required" : undefined,
          reportedContextTokens: KappaSessionOverflow.baseline({
            assistant: lastAssistantInfo,
            finished: lastFinished,
          }),
        })

        const marker = KappaSessionPrompt.memoryPart({ sessionID, message: handle.message, cache: memoryCache })
        if (marker) yield* sessions.updatePart(marker)

        if (structured !== undefined) {
          handle.message.structured = structured
          handle.message.finish = handle.message.finish ?? "stop"
          yield* sessions.updateMessage(handle.message)
          return "break" as const
        }

        const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
        if (finished && !handle.message.error) {
          if (handle.message.finish === "content-filter") {
            handle.message.error = new SessionV1.ContentFilterError({
              message: "The response was blocked by the provider's content filter",
            }).toObject()
            yield* sessions.updateMessage(handle.message)
            yield* events.publish(Session.Event.Error, { sessionID, error: handle.message.error })
            closeReasons.set(sessionID, "error")
            return "break" as const
          }
          if (format.type === "json_schema") {
            handle.message.error = new MessageV2.StructuredOutputError({
              message: "Model did not produce structured output",
              retries: 0,
            }).toObject()
            yield* sessions.updateMessage(handle.message)
            return "break" as const
          }
          if (handle.message.finish === "error") {
            KappaSessionProcessor.providerFinishError(handle.message)
            yield* sessions.updateMessage(handle.message)
            closeReasons.set(sessionID, "error")
            return "break" as const
          }
        }

        if (result === "stop") {
          if (handle.message.error) closeReasons.set(sessionID, "error")
          return "break" as const
        }
        if (result === "compact") {
          const parts = yield* MessageV2.parts(handle.message.id).pipe(
            Effect.provideService(Database.Service, database),
          )
          const hasTools = parts.some(
            (part) =>
              part.type === "tool" &&
              !part.metadata?.providerExecuted &&
              !isOrphanedInterruptedTool(part as SessionV1.ToolPart),
          )
          if (!handle.message.finish || ["tool-calls", "unknown"].includes(handle.message.finish) || hasTools) {
            const guard = KappaSessionPrompt.guardCompactionAttempt({
              sessionID,
              attempts: compactionAttempts,
              closeReasons,
              message: handle.message,
            })
            if (guard.exhausted) {
              yield* sessions.updateMessage(handle.message)
              yield* events.publish(Session.Event.Error, { sessionID, error: guard.error })
              return "break" as const
            }
            compactionAttempts++
            yield* compaction.create({
              sessionID,
              agent: lastUser.agent,
              model: lastUser.model,
              auto: true,
              overflow: handle.message.finish ? undefined : handle.compactError?.() !== undefined,
            })
          }
        }
        if (KappaSessionPromptQueue.hasFollowup(sessionID)) {
          closeReasons.set(sessionID, "superseded")
          const handoff = KappaSessionPromptQueue.active(sessionID)
          if (handoff && GoalState.active(sessionID)) KappaSessionPromptQueue.markSuperseded(sessionID, handoff)
          return "break" as const
        }
        if (result !== "compact" && !handle.message.finish) {
          handle.message.finish = "unknown"
          yield* sessions.updateMessage(handle.message)
        }
        return "continue" as const
      }).pipe(
        Effect.ensuring(instruction.clear(handle.message.id)),
        Effect.onInterrupt(() => finalize),
      )
      if (outcome === "break") break
      continue
    }

    yield* compaction.prune({ sessionID, reason: "normal" }).pipe(Effect.ignore, Effect.forkIn(scope))
    yield* KappaSessionTitle.deferred({ sessionID, scope, sessions, database, generate: title }).pipe(Effect.ignore)
    return yield* lastAssistant(sessionID)
  }) as unknown as Effect.Effect<MessageV2.WithParts, NotFoundError>
