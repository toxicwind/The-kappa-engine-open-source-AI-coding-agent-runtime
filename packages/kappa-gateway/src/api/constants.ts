/**
 * Kappa Gateway Configuration Constants
 * Centralized configuration for all API endpoints, headers, and settings
 */

/** Environment variable for custom Kappa API URL */
export const ENV_KAPPA_API_URL = "KAPPA_API_URL"

/** Default Kappa API URL */
export const DEFAULT_KAPPA_API_URL = "https://api.kappa.ai"

/** Base URL for Kappa API - can be overridden by KAPPA_API_URL env var */
export const KAPPA_API_BASE = process.env[ENV_KAPPA_API_URL] || DEFAULT_KAPPA_API_URL

/** Environment variable for custom Event Service URL */
export const KAPPA_EVENT_SERVICE_URL_ENV = "EVENT_SERVICE_URL"

/** Default Event Service URL (WebSocket endpoint for kappa-chat events) */
export const KAPPA_DEFAULT_EVENT_SERVICE_URL = "wss://events.kiloapps.io"

/** Base URL for Event Service - can be overridden by EVENT_SERVICE_URL env var */
export const KAPPA_EVENT_SERVICE_URL = process.env[KAPPA_EVENT_SERVICE_URL_ENV] || KAPPA_DEFAULT_EVENT_SERVICE_URL

/** Default base URL for OpenRouter-compatible endpoint */
export const KAPPA_OPENROUTER_BASE = `${KAPPA_API_BASE}/api/openrouter`

/** Device auth polling interval in milliseconds */
export const POLL_INTERVAL_MS = 3000

/** Default model for authenticated users */
export const DEFAULT_MODEL = "kappa-auto/free"

/** Default model for anonymous/free usage */
export const DEFAULT_FREE_MODEL = "kappa-auto/free"

/** Token expiration duration in milliseconds (1 year) */
export const TOKEN_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000

/** User-Agent header base value for requests */
export const USER_AGENT_BASE = "opencode-kappa-provider"

/** Content-Type header value for requests */
export const CONTENT_TYPE = "application/json"

/** Default provider name */
export const DEFAULT_PROVIDER_NAME = "kappa"

/** Default API key for anonymous requests */
export const ANONYMOUS_API_KEY = "anonymous"

/** Fetch timeout for model requests in milliseconds (10 seconds) */
export const MODELS_FETCH_TIMEOUT_MS = 10 * 1000

/**
 * Header constants for KappaCode API requests
 */
export const HEADER_ORGANIZATIONID = "X-KAPPACODE-ORGANIZATIONID"
export const HEADER_TASKID = "X-KAPPACODE-TASKID"
export const HEADER_PARENT_TASKID = "X-KAPPACODE-PARENT-TASKID"
export const HEADER_PROJECTID = "X-KAPPACODE-PROJECTID"
export const HEADER_TESTER = "X-KAPPACODE-TESTER"
export const HEADER_EDITORNAME = "X-KAPPACODE-EDITORNAME"
export const HEADER_MACHINEID = "X-KAPPACODE-MACHINEID"

/** Default editor name value */
export const DEFAULT_EDITOR_NAME = "Kappa CLI"

/** Environment variable name for custom editor name */
export const ENV_EDITOR_NAME = "KAPPACODE_EDITOR_NAME"

/** Environment variable name for version (set by CLI at startup) */
export const ENV_VERSION = "KAPPACODE_VERSION"

/** Tester header value for suppressing warnings */
export const TESTER_SUPPRESS_VALUE = "SUPPRESS"

/** Header name for feature tracking */
export const HEADER_FEATURE = "X-KAPPACODE-FEATURE"

/** Environment variable name for feature override */
export const ENV_FEATURE = "KAPPACODE_FEATURE"

export const PROMPTS = [
  "codex",
  "gemini",
  "beast",
  "anthropic",
  "trinity",
  "anthropic_without_todo",
  "ling",
  "gpt55",
] as const

export const AI_SDK_PROVIDERS = [
  "anthropic",
  "openai",
  "openai-compatible",
  "openrouter",
] as const
