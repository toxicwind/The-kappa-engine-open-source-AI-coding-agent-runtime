// ============================================================================
// Plugin
// ============================================================================
export { KappaAuthPlugin, default } from "./plugin.js"

// ============================================================================
// Provider
// ============================================================================
export { createKappa } from "./provider.js"
export { createKappaDebug } from "./provider-debug.js"
export { kappaCustomLoader } from "./loader.js"
export { buildKappaHeaders, getEditorNameHeader, getFeatureHeader, getDefaultHeaders, getUserAgent } from "./headers.js"

// ============================================================================
// Auth
// ============================================================================
export { authenticateWithDeviceAuth } from "./auth/device-auth.js"
export { authenticateWithDeviceAuthTUI } from "./auth/device-auth-tui.js"
export { getKappaUrlFromToken, isValidKappacodeToken, getApiKey } from "./auth/token.js"
export { poll, formatTimeRemaining } from "./auth/polling.js"
export { migrateLegacyKappaAuth, LEGACY_CONFIG_PATH } from "./auth/legacy-migration.js"

// ============================================================================
// API
// ============================================================================
export {
  fetchProfile,
  fetchBalance,
  fetchProfileWithBalance,
  fetchDefaultModel,
  getKappaProfile,
  defaultOrganizationId,
  getKappaBalance,
  getKappaDefaultModel,
  promptOrganizationSelection,
} from "./api/profile.js"
export { fetchKappaPassState } from "./api/kappa-pass.js"
export {
  fetchKappaModels,
  type KappaModelsResult,
  fetchKappaImageModels,
  type KappaImageModel,
  type KappaImageModelsResult,
  fetchKappaTranscriptionModels,
  type KappaTranscriptionModel,
  type KappaTranscriptionModelsResult,
  supportsTools,
} from "./api/models.js"
export {
  EMPTY_KILO_EMBEDDING_MODEL_CATALOG,
  fetchKappaEmbeddingModelCatalog,
  type KappaEmbeddingModel,
  type KappaEmbeddingModelCatalog,
  type KappaEmbeddingModelCatalogIssue,
} from "./api/embedding-models.js"
export { resolveKappaGatewayBaseUrl, resolveKappaOpenRouterBaseUrl } from "./api/url.js"
export {
  AUTOCOMPLETE_MODELS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  getAutocompleteModel,
  getAutocompleteModelById,
  validAutocompleteModel,
  validAutocompleteProvider,
  type AutocompleteModelDef,
  type AutocompleteProviderID,
} from "./autocomplete.js"
export {
  fetchOrganizationModes,
  clearModesCache,
  type OrganizationMode,
  type OrganizationModeConfig,
} from "./api/modes.js"
export { fetchKappacodeNotifications, type KappacodeNotification } from "./api/notifications.js"
export {
  fetchByokEntries,
  fetchCodingPlanSubscriptions,
  fetchCodingPlanUsage,
  type ByokEntry,
  type CodingPlanSubscription,
  type CodingPlanQuotaWindow,
} from "./api/trpc.js"
export {
  fetchCloudSession,
  fetchCloudSessionForImport,
  SessionImportValidationError,
  prepareSessionImport,
  importSessionToDb,
} from "./cloud-sessions.js"

// ============================================================================
// Server Routes (optional - requires hono and OpenCode dependencies)
// ============================================================================
export { createKappaRoutes } from "./server/routes.js"
export {
  GatewayError,
  UnauthorizedError,
  getOrganizationId,
  getCloudSessions,
  getNotifications,
  getProfile,
  getToken,
  setOrganization,
} from "./server/handlers.js"

// ============================================================================
// Note: TUI exports moved to separate entry point
// ============================================================================
// For TUI components and commands, import from "@kappacode/kappa-gateway/tui"
// This avoids circular dependencies with opencode TUI infrastructure

// ============================================================================
// Types
// ============================================================================
export type {
  // Auth types
  DeviceAuthInitiateResponse,
  DeviceAuthPollResponse,
  Organization,
  KappacodeProfile,
  KappacodeBalance,
  KappaPassState,
  PollOptions,
  PollResult,
  // Provider types
  KappaProvider,
  KappaProviderOptions,
  KappaMetadata,
  CustomLoaderResult,
  ProviderInfo,
  LanguageModelV3,
} from "./types.js"

// ============================================================================
// Constants
// ============================================================================
export {
  ENV_KILO_API_URL,
  DEFAULT_KILO_API_URL,
  KILO_API_BASE,
  KILO_EVENT_SERVICE_URL,
  KILO_OPENROUTER_BASE,
  POLL_INTERVAL_MS,
  DEFAULT_MODEL,
  DEFAULT_FREE_MODEL,
  TOKEN_EXPIRATION_MS,
  USER_AGENT_BASE,
  CONTENT_TYPE,
  DEFAULT_PROVIDER_NAME,
  ANONYMOUS_API_KEY,
  MODELS_FETCH_TIMEOUT_MS,
  HEADER_ORGANIZATIONID,
  HEADER_TASKID,
  HEADER_PARENT_TASKID,
  HEADER_PROJECTID,
  HEADER_TESTER,
  HEADER_EDITORNAME,
  HEADER_MACHINEID,
  HEADER_FEATURE,
  DEFAULT_EDITOR_NAME,
  ENV_EDITOR_NAME,
  ENV_VERSION,
  TESTER_SUPPRESS_VALUE,
  ENV_FEATURE,
  PROMPTS,
  AI_SDK_PROVIDERS,
} from "./api/constants.js"
