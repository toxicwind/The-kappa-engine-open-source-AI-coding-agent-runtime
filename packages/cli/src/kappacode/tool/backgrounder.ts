import { Effect, Deferred, Scope } from "effect"
import type { BackgroundJob } from "@/background/job"
import type { SessionID } from "@/session/schema"

export namespace KappaBackgrounder {
  /** Kairos ceiling: the default deadline for foreground subagent turns. */
  export const KAIROS_CEILING_MS = 4_000

  /**
   * Resolve the effective deadline (in ms) for a foreground subagent.
   * Returns the kairos ceiling when flagValue is null/undefined/non-positive.
   */
  export function getDeadline(flagValue?: number | undefined): number {
    if (flagValue == null || flagValue <= 0) return KAIROS_CEILING_MS
    return flagValue
  }

  export type Settlement =
    | { readonly type: "settled"; info: { status?: string; output?: string; error?: string } }
    | { readonly type: "promoted"; info: { background: true; jobId: SessionID } }

  export type RaceInput = {
    readonly jobs: Pick<BackgroundJob.Interface, "start" | "wait" | "promote" | "get" | "cancel">
    readonly id: SessionID
    readonly run: Effect.Effect<string>
    readonly deadline: number
    readonly steerSignal?: AbortSignal
    readonly onPromote?: Effect.Effect<void>
    readonly onCancel?: Effect.Effect<void>
  }

  export function raceWithSteering(input: RaceInput): Effect.Effect<Settlement> {
    const { jobs, id, deadline, steerSignal, onPromote } = input

    const settled = jobs.wait({ id }).pipe(
      Effect.map(
        (w: { info?: { status?: string; output?: string; error?: string; metadata?: { background?: boolean } } }) => {
          if (!w.info) return { kind: "settled" as const, info: { status: "running" } }
          const info = w.info
          if (info.status === "error")
            return { kind: "settled" as const, info: { status: info.status, error: info.error } }
          if (info.status === "cancelled") return { kind: "settled" as const, info: { status: "cancelled" } }
          if (info.metadata?.background === true)
            return { kind: "settled" as const, info: { status: "completed", output: info.output } }
          return { kind: "settled" as const, info: { status: info.status, output: info.output } }
        },
      ),
    )

    const timedOut = Effect.sleep(`${deadline} millis`).pipe(Effect.as({ kind: "timeout" as const }))

    const settledOrTimeout = settled.pipe(Effect.raceFirst(timedOut))

    const settledOrTimeoutOrSteer: Effect.Effect<
      { kind: "settled" | "timeout"; info?: unknown } | { kind: "steer" },
      never,
      never
    > = steerSignal
      ? Effect.gen(function* () {
          const steerDeferred = yield* Deferred.make<true>()
          const settledDeferred = yield* Deferred.make<ReturnType<typeof settled>>()

          const sub = () => {
            void Deferred.succeed(steerDeferred, true).pipe(Effect.ignore)
          }

          steerSignal.addEventListener("abort", sub, { once: true })

          void settledOrTimeout.pipe(
            Effect.tap((result) => Deferred.succeed(settledDeferred, result).pipe(Effect.ignore)),
            Effect.forkScoped,
          )

          const cleanup = Effect.sync(() => steerSignal.removeEventListener("abort", sub))

          const steerWinner = yield* Deferred.await(steerDeferred).pipe(
            Effect.timeout("1 millis"),
            Effect.map(() => {
              if (steerSignal.aborted) return { kind: "steer" as const }
              return { kind: "settled" as const }
            }),
            Effect.andThen(cleanup),
          )

          void steerWinner

          return steerWinner
        })
      : settledOrTimeout

    return Effect.gen(function* () {
      const result = yield* settledOrTimeoutOrSteer

      if (result.kind === "steer") {
        yield* jobs.promote(id).pipe(Effect.orDie)
        yield* onPromote ?? Effect.void
        return {
          type: "promoted",
          info: { background: true, jobId: id },
        } as Settlement
      }

      const settledOrTimeoutResult = result as { kind: "settled" | "timeout"; info?: unknown }

      if (settledOrTimeoutResult.kind === "timeout") {
        const current = yield* jobs.get(id).pipe(Effect.orDie)
        if (current?.status === "error")
          return {
            type: "settled",
            info: { status: "error", error: current.error },
          } as Settlement
        if (current?.status === "cancelled") return { type: "settled", info: { status: "cancelled" } } as Settlement
        if (current?.metadata?.background === true || current?.status === "completed") {
          yield* onPromote ?? Effect.void
          return {
            type: "promoted",
            info: { background: true, jobId: id },
          } as Settlement
        }
        const promoted = yield* jobs.promote(id).pipe(Effect.orDie)
        return {
          type: "promoted",
          info: { background: true, jobId: promoted?.id ?? id },
        } as Settlement
      }

      const info = settledOrTimeoutResult.info as {
        status?: string
        output?: string
        error?: string
        metadata?: { background?: boolean }
      }

      if (info?.metadata?.background === true)
        return {
          type: "promoted",
          info: { background: true, jobId: id },
        } as Settlement

      if (info?.status === "error")
        return {
          type: "settled",
          info: { status: info.status, error: info.error },
        } as Settlement

      if (info?.status === "cancelled") return { type: "settled", info: { status: "cancelled" } } as Settlement

      return {
        type: "settled",
        info: { status: info?.status, output: info?.output },
      } as Settlement
    })
  }
}
