import { Config } from "effect"
import { InstallationChannel } from "../installation/version" // kappacode_change

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

// kappacode_change start
function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

const UNSTABLE_CHANNELS = new Set(["dev", "beta", "local"])
function unstableDefault(key: string) {
  return truthy(key) || (!falsy(key) && UNSTABLE_CHANNELS.has(InstallationChannel))
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const KAPPA_EXPERIMENTAL = truthy("KAPPA_EXPERIMENTAL")
const KAPPA_DISABLE_CLAUDE_CODE = truthy("KAPPA_DISABLE_CLAUDE_CODE")
const KAPPA_DISABLE_CLAUDE_CODE_SKILLS = KAPPA_DISABLE_CLAUDE_CODE || truthy("KAPPA_DISABLE_CLAUDE_CODE_SKILLS")
// kappacode_change end
const copy = process.env["KAPPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["KAPPA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("KAPPA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  KAPPA_AUTO_SHARE: truthy("KAPPA_AUTO_SHARE"), // kappacode_change
  KAPPA_AUTO_HEAP_SNAPSHOT: truthy("KAPPA_AUTO_HEAP_SNAPSHOT"),
  KAPPA_GIT_BASH_PATH: process.env["KAPPA_GIT_BASH_PATH"],
  KAPPA_CONFIG: process.env["KAPPA_CONFIG"],
  KAPPA_CONFIG_CONTENT: process.env["KAPPA_CONFIG_CONTENT"],
  KAPPA_DISABLE_AUTOUPDATE: truthy("KAPPA_DISABLE_AUTOUPDATE"),
  KAPPA_ALWAYS_NOTIFY_UPDATE: truthy("KAPPA_ALWAYS_NOTIFY_UPDATE"),
  KAPPA_DISABLE_PRUNE: truthy("KAPPA_DISABLE_PRUNE"),
  KAPPA_DISABLE_TERMINAL_TITLE: truthy("KAPPA_DISABLE_TERMINAL_TITLE"),
  KAPPA_SHOW_TTFD: truthy("KAPPA_SHOW_TTFD"),
  // kappacode_change start
  KAPPA_DISABLE_DEFAULT_PLUGINS: truthy("KAPPA_DISABLE_DEFAULT_PLUGINS"),
  KAPPA_DISABLE_LSP_DOWNLOAD: truthy("KAPPA_DISABLE_LSP_DOWNLOAD"),
  KAPPA_ENABLE_EXPERIMENTAL_MODELS: truthy("KAPPA_ENABLE_EXPERIMENTAL_MODELS"),
  // kappacode_change end
  KAPPA_DISABLE_AUTOCOMPACT: truthy("KAPPA_DISABLE_AUTOCOMPACT"),
  KAPPA_DISABLE_MODELS_FETCH: truthy("KAPPA_DISABLE_MODELS_FETCH"),
  KAPPA_DISABLE_MOUSE: truthy("KAPPA_DISABLE_MOUSE"),
  // kappacode_change start
  KAPPA_DISABLE_CLAUDE_CODE,
  KAPPA_DISABLE_CLAUDE_CODE_PROMPT: KAPPA_DISABLE_CLAUDE_CODE || truthy("KAPPA_DISABLE_CLAUDE_CODE_PROMPT"),
  KAPPA_DISABLE_CLAUDE_CODE_SKILLS,
  KAPPA_DISABLE_EXTERNAL_SKILLS: truthy("KAPPA_DISABLE_EXTERNAL_SKILLS"),
  KAPPA_EXPERIMENTAL_CUSTOMIZE_SKILL: unstableDefault("KAPPA_EXPERIMENTAL_CUSTOMIZE_SKILL"),
  // kappacode_change end
  KAPPA_FAKE_VCS: process.env["KAPPA_FAKE_VCS"],
  KAPPA_SERVER_PASSWORD: process.env["KAPPA_SERVER_PASSWORD"],
  KAPPA_SERVER_USERNAME: process.env["KAPPA_SERVER_USERNAME"],
  KAPPA_ENABLE_QUESTION_TOOL: truthy("KAPPA_ENABLE_QUESTION_TOOL"), // kappacode_change

  KAPPA_EXPERIMENTAL, // kappacode_change

  KAPPA_EXPERIMENTAL_CLAUDE_MIGRATION: truthy("KAPPA_EXPERIMENTAL_CLAUDE_MIGRATION"), // kappacode_change

  KAPPA_EXPERIMENTAL_FILEWATCHER: Config.boolean("KAPPA_EXPERIMENTAL_FILEWATCHER").pipe(Config.withDefault(false)), // kappacode_change

  KAPPA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("KAPPA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),

  KAPPA_EXPERIMENTAL_ICON_DISCOVERY: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_ICON_DISCOVERY"), // kappacode_change

  KAPPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("KAPPA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),

  KAPPA_ENABLE_EXA: truthy("KAPPA_ENABLE_EXA") || KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_EXA"), // kappacode_change

  KAPPA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("KAPPA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"), // kappacode_change

  KAPPA_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("KAPPA_EXPERIMENTAL_OUTPUT_TOKEN_MAX"), // kappacode_change

  KAPPA_EXPERIMENTAL_OXFMT: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_OXFMT"), // kappacode_change

  KAPPA_EXPERIMENTAL_LSP_TY: truthy("KAPPA_EXPERIMENTAL_LSP_TY"), // kappacode_change

  KAPPA_EXPERIMENTAL_LSP_TOOL: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_LSP_TOOL"), // kappacode_change

  KAPPA_EXPERIMENTAL_SCOUT: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_SCOUT"), // kappacode_change

  KAPPA_EXPERIMENTAL_MARKDOWN: !falsy("KAPPA_EXPERIMENTAL_MARKDOWN"), // kappacode_change

  KAPPA_ENABLE_PARALLEL: truthy("KAPPA_ENABLE_PARALLEL") || truthy("KAPPA_EXPERIMENTAL_PARALLEL"), // kappacode_change

  KAPPA_MODELS_URL: process.env["KAPPA_MODELS_URL"],

  KAPPA_MODELS_PATH: process.env["KAPPA_MODELS_PATH"],

  KAPPA_DISABLE_EMBEDDED_WEB_UI: truthy("KAPPA_DISABLE_EMBEDDED_WEB_UI"), // kappacode_change

  KAPPA_DB: process.env["KAPPA_DB"],

  KAPPA_DISABLE_CHANNEL_DB: truthy("KAPPA_DISABLE_CHANNEL_DB"), // kappacode_change

  KAPPA_SKIP_MIGRATIONS: truthy("KAPPA_SKIP_MIGRATIONS"), // kappacode_change

  KAPPA_STRICT_CONFIG_DEPS: truthy("KAPPA_STRICT_CONFIG_DEPS"), // kappacode_change

  KAPPA_WORKSPACE_ID: process.env["KAPPA_WORKSPACE_ID"],

  KAPPA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("KAPPA_EXPERIMENTAL_WORKSPACES"),

  KAPPA_EXPERIMENTAL_EVENT_SYSTEM: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_EVENT_SYSTEM"), // kappacode_change

  KAPPA_EXPERIMENTAL_SESSION_SWITCHING: KAPPA_EXPERIMENTAL || truthy("KAPPA_EXPERIMENTAL_SESSION_SWITCHING"), // kappacode_change

  KAPPA_EXPERIMENTAL_SESSION_SWITCHER: enabledByExperimental("KAPPA_EXPERIMENTAL_SESSION_SWITCHER"), // kappacode_change

  KAPPA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("KAPPA_DISABLE_FFF"), // kappacode_change

  get KAPPA_DISABLE_PROJECT_CONFIG() {
    return truthy("KAPPA_DISABLE_PROJECT_CONFIG")
  },
  get KAPPA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("KAPPA_EXPERIMENTAL_REFERENCES")
  },
  get KAPPA_TUI_CONFIG() {
    return process.env["KAPPA_TUI_CONFIG"]
  },
  get KAPPA_CONFIG_DIR() {
    return process.env["KAPPA_CONFIG_DIR"]
  },
  get KAPPA_PURE() {
    return truthy("KAPPA_PURE")
  },
  get KAPPA_PERMISSION() {
    return process.env["KAPPA_PERMISSION"]
  },
  get KAPPA_PLUGIN_META_FILE() {
    return process.env["KAPPA_PLUGIN_META_FILE"]
  },
  get KAPPA_CLIENT() {
    return process.env["KAPPA_CLIENT"] ?? "cli"
  },
  // kappacode_change start
  get KAPPA_SESSION_RETRY_LIMIT() {
    return number("KAPPA_SESSION_RETRY_LIMIT")
  },
  // kappacode_change end
}
