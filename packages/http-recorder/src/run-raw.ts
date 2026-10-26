// socket-run-raw.ts — kappacode_change: effect 4.0.6 Socket removed `runRaw(handler, options)`
// (the handler-driven consume-loop). 4.0.6's Socket is pull-based: {reader, writer}.
// This restores the runRaw ergonomic on top of the new model so existing call
// sites (pty handlers, proxy middleware, ws recorder) keep their shape.
//
// Semantics preserved from the beta.83 Socket.runRaw:
// - runs the handler for every incoming message until the socket closes
// - `onOpen` fires once before the first message
// - a closed peer ends the loop naturally (SocketError reason "Closed");
//   any other SocketError is a real failure and propagates
import { Cause, Effect, FiberSet, Result, Scope } from "effect"
import { Socket } from "effect/socket"

export interface RunRawOptions {
  readonly onOpen?: Effect.Effect<void, unknown, unknown> | undefined
}

type Frame = Uint8Array | string

const isClosedReason = (error: Socket.SocketError): boolean => {
  const reason: unknown = (error as { reason?: unknown }).reason
  const message = String((error as { message?: string }).message ?? "")
  const tag = (error as { _tag?: string })._tag
  if (tag === "SocketCloseError") return true
  if (typeof reason === "object" && reason !== null) {
    const rtag = (reason as { _tag?: string })._tag
    const rmsg = String((reason as { message?: string }).message ?? "")
    return rtag === "Closed" || rtag === "SocketCloseError" || rmsg.toLowerCase().includes("closed")
  }
  return message.toLowerCase().includes("closed")
}

export const runRaw = <A, E, R>(
  socket: Socket.Socket,
  handler: (message: Frame) => Effect.Effect<unknown, E, R> | void,
  options?: RunRawOptions,
): Effect.Effect<void, E | Socket.SocketError, R | Scope.Scope> =>
  Effect.gen(function* () {
    // kappacode_change: acquire the reader FIRST — 4.0.6 recorders claim their
    // session at acquisition, so state claims must precede any onOpen write.
    const reader = yield* socket.reader
    if (options?.onOpen) yield* Effect.asVoid(options.onOpen as Effect.Effect<void, never, never>)
    // handlers run on a FiberSet: a blocking handler must not starve later
    // frames (beta.83 runRaw semantic — handlers execute concurrently)
    const handlers = yield* FiberSet.make<unknown, E>()
    const run = yield* FiberSet.runtime(handlers)<R>()
    const loop: Effect.Effect<void, E | Socket.SocketError, R> = Effect.gen(function* () {
      while (true) {
        const batch = yield* reader.pull
        for (const chunk of batch) {
          const result = handler(chunk)
          if (Effect.isEffect(result)) run(result) // fork + register in FiberSet; drained below
        }
      }
    })
    const drained = Effect.catchCause(loop, (cause) => {
      const found = Cause.findFail(cause)
      const fail = Result.isSuccess(found) ? (found.success as { error?: unknown }).error : undefined
      return fail !== undefined && isClosedReason(fail as Socket.SocketError)
        ? Effect.void
        : Effect.failCause(cause)
    })
    yield* drained
    yield* FiberSet.awaitEmpty(handlers)
  })

/** String-flavored runRaw: decodes each frame as UTF-8 text before the handler. */
export const runString = <A, E, R>(
  socket: Socket.Socket,
  handler: (message: string) => Effect.Effect<unknown, E, R> | void,
  options?: RunRawOptions,
): Effect.Effect<void, E | Socket.SocketError, R | Scope.Scope> =>
  runRaw(
    socket,
    (message) => handler(typeof message === "string" ? message : new TextDecoder().decode(message)),
    options,
  )

