import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import * as KappaError from "@/kappacode/provider/error" // kappacode_change
import type { ProviderV2 } from "@opencode-ai/core/provider"
import { isContextOverflow } from "@opencode-ai/llm"

export class HeaderTimeoutError extends Error {
  public override readonly name = "ProviderHeaderTimeoutError"

  constructor(public readonly ms: number) {
    super(`Provider response headers timed out after ${ms}ms`)
  }
}

export class ResponseStreamError extends Error {
  public override readonly name = "ProviderResponseStreamError"

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

function isOpenAiErrorRetryable(e: APICallError) {
  const status = e.statusCode
  if (!status) return e.isRetryable
  // openai sometimes returns 404 for models that are actually available
  return status === 404 || e.isRetryable
}

// Providers not reliably handled in this function:
// - z.ai: can accept overflow silently (needs token-count/context-window checks)
function message(providerID: ProviderV2.ID, e: APICallError) {
  return iife(() => {
    const hint = KappaError.hint(providerID, e) // kappacode_change
    if (hint) return hint // kappacode_change
    // kappacode_change start - surface a branded reauth hint for expired Copilot tokens
    if (providerID.includes("github-copilot") && e.statusCode === 403) {
      return "Please reauthenticate with the copilot provider to ensure your credentials work properly with Kappa."
    }
    // kappacode_change end
    const msg = e.message
    if (msg === "") {
      if (e.responseBody) return e.responseBody
      if (e.statusCode) {
        const err = STATUS_CODES[e.statusCode]
        if (err) return err
      }
      return "Unknown error"
    }

    if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
      return msg
    }

    try {
      const body = JSON.parse(e.responseBody)
      // try to extract common error message fields
      const errMsg = body.message || body.error || body.error?.message
      if (errMsg && typeof errMsg === "string") {
        return `${msg}: ${errMsg}`
      }
    } catch {}

    // If responseBody is HTML (e.g. from a gateway or proxy error page),
    // provide a human-readable message instead of dumping raw markup
    if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
      if (e.statusCode === 401) {
        return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired — try running `kappa auth login <your provider URL>` to re-authenticate." // kappacode_change
      }
      if (e.statusCode === 403) {
        return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource — check your account and provider settings."
      }
      return msg
    }

    return `${msg}: ${e.responseBody}`
  }).trim()
}

function json(input: unknown) {
  if (typeof input === "string") {
    try {
      const result = JSON.parse(input)
      if (result && typeof result === "object") return result
      return undefined
    } catch {
      return undefined
    }
  }
  if (typeof input === "object" && input !== null) {
    return input
  }
  return undefined
}

export type ParsedStreamError =
  | {
      type: "context_overflow"
      message: string
      responseBody: string
    }
  | {
      type: "api_error"
      message: string
      isRetryable: boolean
      responseBody: string
    }

export function parseStreamError(input: unknown): ParsedStreamError | undefined {
  const raw = json(input)
  // kappacode_change start - unwrap response.failed frames and bare provider error objects before the envelope gate
  const original = typeof raw?.message === "string" ? (json(raw.message) ?? raw) : raw
  if (!original) return

  const responseBody = JSON.stringify(original)
  const body = KappaError.frame(original)
  // kappacode_change end
  if (body.type !== "error") return

  switch (
    body?.error?.code ??
    body?.error?.type // kappacode_change
  ) {
    case "context_length_exceeded":
      return {
        type: "context_overflow",
        message: "Input exceeds context window of this model",
        responseBody,
      }
    // kappacode_change start - normalize empty provider rate-limit stream errors
    case "rate_limit_exceeded":
      return {
        type: "api_error",
        message:
          typeof body?.error?.message === "string" && body.error.message.trim()
            ? body.error.message
            : "Provider rate limit exceeded. Please try again shortly.",
        isRetryable: true,
        responseBody,
      }
    // kappacode_change end
    case "insufficient_quota":
      return {
        type: "api_error",
        message: "Quota exceeded. Check your plan and billing details.",
        isRetryable: false,
        responseBody,
      }
    case "usage_not_included":
      return {
        type: "api_error",
        message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
        isRetryable: false,
        responseBody,
      }
    case "invalid_prompt":
      return {
        type: "api_error",
        message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
        isRetryable: false,
        responseBody,
      }
    case "server_is_overloaded":
    case "server_error":
      return {
        type: "api_error",
        message: typeof body?.error?.message === "string" ? body?.error?.message : "Server error.",
        isRetryable: true,
        responseBody,
      }
  }
  return KappaError.fallback(body, responseBody) // kappacode_change - render unlisted provider error codes as clean messages
}

export type ParsedAPICallError =
  | {
      type: "context_overflow"
      message: string
      responseBody?: string
    }
  | {
      type: "api_error"
      message: string
      statusCode?: number
      isRetryable: boolean
      responseHeaders?: Record<string, string>
      responseBody?: string
      metadata?: Record<string, string>
    }

export function parseAPICallError(input: { providerID: ProviderV2.ID; error: APICallError }): ParsedAPICallError {
  const m = message(input.providerID, input.error)
  const body = json(input.error.responseBody)
  if (isContextOverflow(m) || input.error.statusCode === 413 || body?.error?.code === "context_length_exceeded") {
    return {
      type: "context_overflow",
      message: m,
      responseBody: input.error.responseBody,
    }
  }

  const metadata = input.error.url ? { url: input.error.url } : undefined
  // kappacode_change start - OpenRouter guardrail/policy blocks are a 404 that
  // must NOT be retried. The openai-family branch treats every 404 as
  // "model actually available, retry", which turns a permanent
  // account-level privacy/guardrail exclusion into a multi-retry stall
  // ("Retry budget exhausted after 3 retries: 404") before any fallback.
  const policyBlocked = KappaError.isProviderPolicyBlock({
    status: input.error.statusCode,
    body,
    message: m,
  })
  // kappacode_change end
  return {
    type: "api_error",
    // kappacode_change start - surface an actionable guardrail message instead
    // of a bare 404 and mark it non-retryable so the retry policy gives up
    // immediately (and any model fallback kicks in on the first failure).
    message: policyBlocked
      ? `${m}. Model blocked by OpenRouter account/guardrail privacy settings. Enable paid endpoints that may train on inputs at https://openrouter.ai/settings/privacy, or select a model with a compliant ZDR endpoint.`
      : m,
    statusCode: input.error.statusCode,
    isRetryable: policyBlocked
      ? false
      : (input.providerID.startsWith("openai") ? isOpenAiErrorRetryable(input.error) : input.error.isRetryable) ||
        KappaError.isOverloaded(input.error.statusCode, body, m), // kappacode_change
    // kappacode_change end
    responseHeaders: input.error.responseHeaders,
    responseBody: input.error.responseBody,
    metadata,
  }
}

export * as ProviderError from "./error.ts"
