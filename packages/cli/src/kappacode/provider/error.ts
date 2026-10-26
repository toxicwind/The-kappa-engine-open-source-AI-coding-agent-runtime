import type { APICallError } from "ai"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { isRecord } from "@/util/record"
import { z } from "zod"

export type Frame = {
  type?: unknown
  error?: Record<string, unknown>
} & Record<string, unknown>

const payload = z.looseObject({
  code: z.union([z.string(), z.number()]).nullish(),
  message: z.string().nullish(),
})

// kappacode_change start - OpenRouter provider-policy blocks
//
// OpenRouter rewrote its "model blocked by your privacy/guardrail settings"
// message (2026-09) from the plain-text form to `0 endpoints out of N
// requested are available...`. A blocked model surfaces as an HTTP 404 with
// that body, and (newer responses) also carry structured metadata:
//   metadata.failed_routing_step = "Filter by Guardrails"
//   metadata.ineligibility_reasons[].reason in {model-ignored-by-guardrail,
//   zdr-violation-by-account, zdr-violation-by-guardrail}
//
// This is a permanent account/guardrail routing exclusion, NOT a transient
// 404 (openai-family clients historically treat any 404 as "model actually
// available, retry"). Retrying it just burns the backoff budget ("Retry
// budget exhausted after 3 retries: 404"). Detect it so the failing turn
// gives up immediately / falls back instead of retrying.
const GUARDRAIL_ZERO_ENDPOINTS =
  /0 endpoints? out of \d+ requested (?:are|is|was)? available matching your guardrail restrictions and data policy/i
const GUARDRAIL_FAILED_STEP = "Filter by Guardrails"
export const PROVIDER_POLICY_BLOCK_REASONS = new Set([
  "model-ignored-by-guardrail",
  "zdr-violation-by-account",
  "zdr-violation-by-guardrail",
])

function ineligibilityReasons(body: Record<string, unknown>): Array<string> {
  const reasons = body.ineligibility_reasons
  if (!Array.isArray(reasons)) return []
  return reasons.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const reason = entry.reason
    return typeof reason === "string" ? [reason] : []
  })
}

export function isProviderPolicyBlock(input: { status?: number; body?: unknown; message?: string }): boolean {
  if (input.status !== 404) return false
  if (typeof input.message === "string" && GUARDRAIL_ZERO_ENDPOINTS.test(input.message)) return true
  const body = isRecord(input.body) ? input.body : undefined
  if (!body) return false
  const metadata = isRecord(body.metadata) ? body.metadata : undefined
  if (metadata?.failed_routing_step === GUARDRAIL_FAILED_STEP) return true
  if (ineligibilityReasons(body).some((reason) => PROVIDER_POLICY_BLOCK_REASONS.has(reason))) return true
  const error = isRecord(body.error) ? body.error : undefined
  if (error && typeof error.message === "string" && GUARDRAIL_ZERO_ENDPOINTS.test(error.message)) return true
  return false
}
// kappacode_change end

// OpenAI Responses API terminal frame forwarded by @ai-sdk/openai >= 3.0.82
const terminal = z.looseObject({
  type: z.literal("response.failed"),
  response: z.looseObject({ error: payload }),
})

// Envelope-less chat-completions wrapper; checked before `bare` so a
// nested `error` record wins over bare top-level fields and gateway
// wrappers keep the specific inner code
const wrapper = z.looseObject({
  type: z.undefined().optional(),
  error: payload,
})

// Bare error object
const bare = z.looseObject({
  type: z.undefined().optional(),
  code: z.union([z.string(), z.number(), z.null()]),
  message: z.string(),
})

/**
 * Normalize provider stream error frames that arrive without the
 * `{ type: "error" }` envelope expected by ProviderError.parseStreamError.
 */
export function frame(body: unknown): Frame {
  const failed = terminal.safeParse(body)
  if (failed.success) return { type: "error", error: failed.data.response.error }
  const wrapped = wrapper.safeParse(body)
  if (wrapped.success) return { ...wrapped.data, type: "error" }
  const direct = bare.safeParse(body)
  if (direct.success) return { ...direct.data, type: "error", error: direct.data }
  if (!isRecord(body)) return {}
  return { ...body, error: isRecord(body.error) ? body.error : undefined }
}

const RETRYABLE =
  /rate.?limit|too.?many.?requests|rate increased too quickly|exhausted|overload|server|unavailable|timeout/i
// Keep free-form message matching narrow: Session.retryable only applied
// rate-limit phrases to prose; the wider pattern above is for structured
// code/type fields only
const RETRYABLE_TEXT =
  /rate increased too quickly|rate.?limit|too.?many.?requests|try again (?:later|in\b)|(?:currently|temporarily) at capacity|temporarily unavailable/i

// Must stay at least as permissive as the Session.retryable heuristics that
// applied when these frames still surfaced as NamedError.Unknown, or
// previously-retried provider errors silently become terminal
function retryable(error: Frame["error"], message: string) {
  const code = error?.code
  const numeric = typeof code === "number" ? code : typeof code === "string" && code.trim() !== "" ? Number(code) : NaN
  if (!Number.isNaN(numeric)) {
    if (numeric === 429 || (numeric >= 500 && numeric < 600)) return true
  } else if (typeof code === "string" && RETRYABLE.test(code)) {
    return true
  }
  const type = error?.type
  if (typeof type === "string" && RETRYABLE.test(type)) return true
  return RETRYABLE_TEXT.test(message)
}

/**
 * Terminal handler for normalized frames whose error code is not listed in
 * ProviderError.parseStreamError: surface the provider message instead of
 * falling back to a raw JSON dump. Retryable only for rate-limit and
 * 5xx-style signals in the code, type, or message.
 */
export function fallback(body: Frame, responseBody: string) {
  const message = body.error?.message
  if (typeof message !== "string" || !message.trim()) return
  return { type: "api_error" as const, message, isRetryable: retryable(body.error, message), responseBody }
}

export function isOverloaded(status: number | undefined, body: unknown, msg: string): boolean {
  if (status !== undefined && [429, 500, 502, 503, 504, 520, 524, 529].includes(status)) return true
  const f = frame(body)
  if (retryable(f.error, msg)) return true
  return /overload|overloaded_error|server_is_overloaded|exhausted|temporarily unavailable|at capacity|rate.?limit|too many requests/i.test(
    msg,
  )
}

const AUTH_ERROR =
  "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project."

export function hint(provider: ProviderV2.ID, error: APICallError) {
  if (provider !== ProviderV2.ID.make("google")) return
  if (error.statusCode !== 401) return
  if (error.message !== AUTH_ERROR) return

  return "Google Gemini rejected this API key. Check its type and status in Google AI Studio. Replace a Standard key with a new auth key; if it is already an auth key, check its Gemini API access or create a replacement. Restricted Standard keys work only until September 2026. See https://kilo.ai/docs/ai-providers/gemini."
}
