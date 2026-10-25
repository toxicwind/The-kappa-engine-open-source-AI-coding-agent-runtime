import type { NamedError } from "@opencode-ai/core/util/error"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2.ts"
import { isKappaError } from "@/kappacode/kappa-errors" // kappacode_change
import { SessionNetwork } from "./network.ts" // kappacode_change
import { iife } from "@/util/iife"
import { isRecord } from "@/util/record"

export type Err = ReturnType<NamedError["toObject"]>

export type RetryReason = string & {} // kappacode_change - Kappa does not support OpenCode Go upsell reasons

export type Retryable = {
  message: string
  action?: {
    reason: RetryReason
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
}

export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_JITTER_FACTOR = 0.25
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MAX_RETRIES = 10 // kappacode_change

const RETRYABLE_MESSAGE_PATTERNS = [
  /\b(?:429|500|502|503|504|524)\b/i, // kappacode_change
  /rate increased too quickly|rate limit|rate-limit|rate_limit|too many requests/i,
  /overloaded|service unavailable|service_unavailable|service-unavailable|internal error|internal_error|internal server error|server error|server_error|server-error|provider returned error|provider_returned_error|provider-returned-error/i,
  /terminated|fetch failed|failed to fetch|network[-_\s]error|upstream connect|connection error|connection refused|connection lost|socket connection was closed|socket hang up|reset before headers|getaddrinfo|enotfound|eai_again|econnrefused|econnreset|etimedout/i,
  /^timeout$|\b(?:request|response|connection|network|stream|read) (?:timeout|timed out|time out)\b/i,
  /try your request again|retry your request|resource exhausted|resource_exhausted/i,
  /\btry again (?:later|in\b)|\b(?:currently|temporarily) at capacity\b/i,
]

function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

export function delay(attempt: number, error?: SessionV1.APIError, random = Math.random()) {
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs)
        }
      }

      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return cap(Math.ceil(parsedSeconds * 1000))
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now()
        if (!Number.isNaN(parsed) && parsed > 0) {
          return cap(Math.ceil(parsed))
        }
      }

      return cap(exponential(attempt, random))
    }
  }

  return cap(Math.min(exponential(attempt, random), RETRY_MAX_DELAY_NO_HEADERS))
}

function exponential(attempt: number, random: number) {
  const base = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
  return Math.ceil(base + base * RETRY_JITTER_FACTOR * random)
}

// kappacode_change - Kappa does not emit OpenCode Go actions
export function retryable(error: Err, _provider?: string): Retryable | undefined {
  // context overflow errors should not be retried
  if (SessionV1.ContextOverflowError.isInstance(error)) return undefined
  if (SessionV1.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // kappacode_change start - Current Kappa errors require user action (login/signup), don't retry
    if (isKappaError(error)) return undefined
    if (
      error.data.isRetryable === false &&
      (status === undefined || (status < 500 && status !== 429)) &&
      !error.data.responseBody &&
      !matchesRetryableMessage(error.data.message)
    )
      return undefined
    // kappacode_change end

    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (
      !error.data.isRetryable &&
      !(status !== undefined && status >= 500) &&
      !matchesRetryableMessage(error.data.message) &&
      !matchesRetryableMessage(error.data.responseBody)
    )
      return undefined

    // kappacode_change start - Kappa does not support OpenCode Go upsells. FreeUsageLimitError is not retryable: retrying
    // the same capped model is futile and the backoff loop cannot be broken by switching models in the chat selector
    // because the retry loop holds a stale model ref.
    if (error.data.responseBody?.includes("FreeUsageLimitError")) return undefined
    // kappacode_change end
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
  }

  const message = isRecord(error.data) ? error.data.message : undefined
  if (typeof message !== "string") return undefined
  const lower = message.toLowerCase()
  if (lower.includes("too_many_requests")) return { message: "Too Many Requests" }
  if (lower.includes("exhausted") || lower.includes("unavailable")) return { message: "Provider is overloaded" }
  if (matchesRetryableMessage(message)) return { message }
  return undefined
}

function matchesRetryableMessage(value: unknown) {
  return typeof value === "string" && RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(value))
}

function parseJSON(value: unknown) {
  return iife(() => {
    try {
      if (typeof value !== "string") return undefined
      return JSON.parse(value)
    } catch {
      return undefined
    }
  })
}

// kappacode_change start — detect a concurrency-contained 429 shed
// A 429 with no provider rate-limit headers is a local/shelder concurrency
// throttle (e.g. Thresher concurrency shedder, retry-after: 1) rather than a
// real provider rate limit. When the requesting provider opts into unlimited
// retry, these are retried indefinitely instead of hitting the hard cap.
function isConcurrencyShed(error: Err): boolean {
  if (SessionV1.APIError.isInstance(error)) {
    if (error.data.statusCode === 429) return true
    if (matchesRetryableMessage(error.data.responseBody)) return true
    const lower = String(error.data.message ?? "").toLowerCase()
    if (lower.includes("too many requests") || lower.includes("rate limit")) return true
  }
  const lower = String(isRecord(error.data) ? error.data.message : "").toLowerCase()
  return lower.includes("too_many_requests") || lower.includes("too many requests")
}
// kappacode_change end

export function policy(opts: {
  provider: string
  parse: (error: unknown) => Err
  set: (input: { attempt: number; message: string; action?: Retryable["action"]; next: number }) => Effect.Effect<void>

  limit?: number
  // kappacode_change start — config-gated unlimited retry on concurrency-contained 429
  // When set and the failure is a concurrency shed (429 / "too many requests"
  // with no real provider rate limit), retry indefinitely instead of capping at
  // RETRY_MAX_RETRIES. Default OFF. Consumers wire this from provider config.
  unlimitedOnRetryable429?: boolean
  // kappacode_change end
  offline?: (input: { error: unknown; message: string }) => Effect.Effect<"retry" | "blocked" | "aborted">
}) {
  const state = { offline: 0 } // kappacode_change
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      // kappacode_change start — enforce retry limit
      if (opts.limit !== undefined && meta.attempt > opts.limit) {
        return Cause.done(meta.attempt)
      }
      // kappacode_change end

      const error = opts.parse(meta.input)
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
      return Effect.gen(function* () {
        // kappacode_change start — handle network disconnect via offline handler
        // A retryable connection reset is a transient server-side failure: retry
        // it through the normal backoff path instead of the offline wait.
        if (opts.offline && SessionNetwork.disconnected(meta.input) && !SessionNetwork.serverReset(error)) {
          const result = yield* opts.offline({
            error: meta.input,
            message: SessionNetwork.message(meta.input),
          })
          if (result !== "retry") {
            return yield* Cause.done(meta.attempt)
          }
          state.offline += 1
          yield* opts.set({ attempt: 0, message: "Reconnected", next: Date.now() })
          return [0, Duration.zero] as [number, Duration.Duration]
        }
        // kappacode_change end

        // kappacode_change start
        const attempt = opts.limit === undefined ? meta.attempt - state.offline : meta.attempt
        // kappacode_change start — config-gated unlimited retry on concurrency-contained 429
        // When the provider opts in and the failure is a concurrency shed (429 /
        // "too many requests" with no real rate limit), retry indefinitely: skip
        // the RETRY_MAX_RETRIES ceiling but keep honoring backoff / retry-after.
        const unlimitedShed = opts.unlimitedOnRetryable429 === true && isConcurrencyShed(error)
        if (opts.limit === undefined && attempt > RETRY_MAX_RETRIES && !unlimitedShed) return yield* Cause.done(attempt)
        // kappacode_change end
        // kappacode_change end
        const wait = delay(attempt, SessionV1.APIError.isInstance(error) ? error : undefined) // kappacode_change
        const now = yield* Clock.currentTimeMillis
        yield* opts.set({
          attempt, // kappacode_change
          message: retry.message,
          action: retry.action,
          next: now + wait,
        })
        return [attempt, Duration.millis(wait)] as [number, Duration.Duration] // kappacode_change
      })
    }),
  )
}

export * as SessionRetry from "./retry.ts"
