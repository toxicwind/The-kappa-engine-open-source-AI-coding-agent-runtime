import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { KappaProvider, KappaProviderOptions } from "./types.js"
import { getApiKey } from "./auth/token.js"
import { buildKappaHeaders, getDefaultHeaders } from "./headers.js"
import { ANONYMOUS_API_KEY } from "./api/constants.js"
import { resolveKappaOpenRouterBaseUrl } from "./api/url.js"
import { transformRequestBody } from "./responses.js"
import * as GatewayMetadata from "./gateway-metadata.js"
// kappacode_change - OpenCode Zen free tier bypass
import { openCodeFreeURL, isOpenCodeFreeTierError } from "./kappacode/provider/opencode-zen.js"
// kappacode_change end

export function buildRequestHeaders(defaultHeaders: Record<string, string>, requestHeaders?: HeadersInit): Headers {
  const headers = new Headers(defaultHeaders)
  new Headers(requestHeaders).forEach((value, key) => {
    headers.set(key, value)
  })
  return headers
}

/**
 * Create a KappaCode provider instance
 *
 * This provider wraps the OpenRouter SDK with KappaCode-specific configuration
 * including custom authentication, headers, and base URL.
 *
 * @example
 * ```typescript
 * const provider = createKappa({
 *   kappacodeToken: "your-token-here",
 *   kappacodeOrganizationId: "org-123"
 * })
 *
 * const model = provider.languageModel("anthropic/claude-sonnet-4")
 * ```
 */
export function createKappa(options: KappaProviderOptions = {}): KappaProvider {
  // Get API key from options or environment
  const apiKey = getApiKey(options)

  const openRouterUrl = resolveKappaOpenRouterBaseUrl({ baseURL: options.baseURL, token: apiKey })

  // Merge custom headers with defaults
  const customHeaders = {
    ...getDefaultHeaders(),
    ...buildKappaHeaders(undefined, {
      kappacodeOrganizationId: options.kappacodeOrganizationId,
      kappacodeTesterWarningsDisabledUntil: undefined,
    }),
    ...options.headers,
  }

  // Create custom fetch wrapper to add dynamic headers
  const originalFetch = options.fetch ?? fetch
  const wrappedFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = buildRequestHeaders(customHeaders, init?.headers)
    let body = transformRequestBody(input, init?.body, options.dataCollection)

    // Add authorization if API key exists
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`)
    }

    // kappacode_change start - OpenCode Zen free tier bypass
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
    const zenUrl = openCodeFreeURL(requestUrl)
    const isZen = zenUrl !== requestUrl
    if (isZen) {
      input = zenUrl
      headers.set("User-Agent", "opencode/1.19.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14")
      headers.set("x-opencode-client", "cli")
      headers.set("x-opencode-project", "global")
      headers.delete("x-session-affinity")
      headers.delete("X-Session-Id")
      headers.set("x-opencode-session", "kappa-session")
      headers.set("x-opencode-session-id", "kappa-session")
      headers.set("x-opencode-request", crypto.randomUUID())
    }
    // kappacode_change end

    const resp = await originalFetch(input, {
      ...init,
      headers,
      body,
    })

    // kappacode_change start - FreeTierError → model_not_found translation
    if (isZen && resp.status === 403) {
      const text = await resp.clone().text().catch(() => "")
      if (isOpenCodeFreeTierError(403, undefined, text)) {
        return new Response(
          JSON.stringify({
            error: {
              message: "model_not_found",
              type: "model_not_found",
              param: null,
              code: "model_not_found",
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        )
      }
    }
    // kappacode_change end

    return resp
  }

  const sdkOptions = {
    baseURL: openRouterUrl,
    apiKey: apiKey ?? ANONYMOUS_API_KEY,
    headers: customHeaders,
    fetch: wrappedFetch as typeof fetch,
  }

  const openrouter = createOpenRouter(sdkOptions)
  const anthropic = createAnthropic(sdkOptions)
  const openai = createOpenAI(sdkOptions)
  const openaiCompatible = createOpenAICompatible({ ...sdkOptions, name: "openaiCompatible" })

  return {
    languageModel(modelId) {
      return openrouter(modelId)
    },
    embeddingModel(modelId: string) {
      return openrouter.textEmbeddingModel(modelId)
    },
    rerankingModel(modelId: string): never {
      throw new Error(`Reranking model not supported: ${modelId}`)
    },
    imageModel(modelId) {
      return openrouter.imageModel(modelId)
    },
    anthropic(modelId) {
      return GatewayMetadata.wrap(anthropic(modelId))
    },
    openai(modelId) {
      return GatewayMetadata.wrap(openai(modelId))
    },
    openaiCompatible(modelId) {
      return openaiCompatible(modelId)
    },
  }
}
