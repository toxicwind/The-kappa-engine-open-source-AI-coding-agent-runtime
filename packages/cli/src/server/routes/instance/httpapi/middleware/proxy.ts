import { ProxyUtil } from "@/server/proxy-util"
import { runRaw } from "@opencode-ai/core/util/socket-run-raw" // kilocode_change - effect 4 removed Socket.runRaw
import { Effect, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Socket from "effect/socket/Socket"
import { WebSocketTracker } from "../websocket-tracker.ts"

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  if (request.source instanceof Request && request.source.body === null) return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len ? Number(len) : undefined)
}

export function websocket(
  request: HttpServerRequest.HttpServerRequest,
  target: string | URL,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, Socket.WebSocketConstructor> {
  return Effect.scoped(
    Effect.gen(function* () {
      const inbound = yield* Effect.orDie(request.upgrade)
      const outbound = yield* Socket.makeWebSocket(ProxyUtil.websocketTargetURL(target), {
        protocols: ProxyUtil.websocketProtocols(request.headers),
      })
      const writeInbound = yield* inbound.writer
      const writeOutbound = yield* outbound.writer
      const closeSocket = (socket: Socket.Socket, write: (event: Socket.CloseEvent) => Effect.Effect<void, unknown>) =>
        runRaw(socket, () => Effect.void, {
            onOpen: write(WebSocketTracker.SERVER_CLOSING_EVENT()).pipe(Effect.catch(() => Effect.void)),
          }).pipe(
            Effect.timeout("1 second"),
            Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
            Effect.catch(() => Effect.void),
          )
      const closeAccepted = Effect.all([closeSocket(inbound, (event) => writeInbound.write(event)), closeSocket(outbound, (event) => writeOutbound.write(event))], { // kilocode_change
        concurrency: "unbounded",
        discard: true,
      })
      const registered = yield* WebSocketTracker.register(
        Effect.all(
          [
            writeInbound.write(WebSocketTracker.SERVER_CLOSING_EVENT()), // kilocode_change
            writeOutbound.write(WebSocketTracker.SERVER_CLOSING_EVENT()), // kilocode_change
          ],
          { concurrency: "unbounded", discard: true },
        ),
      )
      if (!registered) {
        yield* closeAccepted
        return HttpServerResponse.empty()
      }

      yield* runRaw(outbound, (message) => writeInbound.write(message)) // kilocode_change
        .pipe(
          Effect.catchReason("SocketError", "SocketCloseError", (reason) =>
            writeInbound.write(new Socket.CloseEvent(reason.code, reason.closeReason)).pipe(Effect.catch(() => Effect.void)), // kilocode_change
          ),
          Effect.catch(() =>
            writeInbound.write(new Socket.CloseEvent(1011, "proxy error")).pipe(Effect.catch(() => Effect.void)), // kilocode_change
          ),
          Effect.forkScoped,
        )

      yield* runRaw(inbound, (message) => {
          return writeOutbound.write(typeof message === "string" ? message : message.slice()) // kilocode_change
        })
        .pipe(
          Effect.catch(() => Effect.void),
          Effect.ensuring(writeOutbound.write(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void))), // kilocode_change
        )
      return HttpServerResponse.empty()
    }).pipe(Effect.orDie),
  )
}

function statusText(response: unknown) {
  return (response as { source?: Response }).source?.statusText
}

export function http(
  client: HttpClient.HttpClient,
  url: string | URL,
  extra: HeadersInit | undefined,
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse> {
  return Effect.gen(function* () {
    const response = yield* client.execute(
      HttpClientRequest.make(request.method as never)(url, {
        headers: ProxyUtil.headers(request.headers as HeadersInit, extra),
        body: requestBody(request),
      }),
    )
    const headers = new Headers(response.headers as HeadersInit)
    headers.delete("content-encoding")
    headers.delete("content-length")

    // An upstream 5xx from a remote workspace sandbox arrives here as an opaque
    // status — its real cause (and log line) live only inside the sandbox. Buffer
    // the small error body, log it locally so it shows up in the host's log, and
    // forward it unchanged (preserving content-type so the client can still parse
    // the structured error, e.g. its `ref`).
    if (response.status >= 500) {
      // kappacode_change start
      const body = yield* response.stream.pipe(
        Stream.decodeText(),
        Stream.runFold(() => "", (acc: string, str: string) => {
          const needed = 65536 - acc.length
          return needed > 0 ? acc + (str.length > needed ? str.slice(0, needed) : str) : acc
        }),
        Effect.catch(() => Effect.succeed("")),
      )
      const contentType =
        response.headers["content-type"] ?? (body.trim().startsWith("{") ? "application/json" : "text/plain")
      // kappacode_change end
      headers.delete("content-type")
      yield* Effect.logError("workspace proxy upstream error", {
        url: url.toString(),
        method: request.method,
        status: response.status,
        body: body.slice(0, 2000),
      })
      return HttpServerResponse.text(body, {
        status: response.status,
        statusText: statusText(response),
        headers,
        contentType,
      })
    }

    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      statusText: statusText(response),
      headers,
    })
  }).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))))
}

export * as HttpApiProxy from "./proxy.ts"
