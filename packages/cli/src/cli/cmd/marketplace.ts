// kappacode_change - new file
// `kappa marketplace` — Kappa extension marketplace management.
//
// Subcommands:
//   marketplace list              list configured + known marketplace sources
//   marketplace add <name> <url>  [--ref <ref>] [--manifest <json>] add a source
//   marketplace remove <name>     remove a source
//
// Reads/writes the `marketplace` config key in the global kappa.jsonc plus the
// local registry (~/.config/kappa/marketplace.json). Additive to the existing
// plugin/plug command — Kilo-format plugin loading is untouched.
import { EOL } from "os"
import { Effect } from "effect"
import { effectCmd, fail, CliError } from "../effect-cmd.ts"
import { UI } from "../ui.ts"
import {
  addMarketplace,
  configPath,
  readConfigMarketplaces,
  readRegistry,
  removeMarketplace,
} from "@/plugin/marketplace"

const OK = UI.Style.TEXT_SUCCESS_BOLD + UI.Style.TEXT_NORMAL
const MUTED = UI.Style.TEXT_DIM

type ActionInput = { action: string; name: string; url: string; ref: string; manifest: string }

function printEntry(entry: { name: string; url: string; ref?: string }, configured: boolean) {
  process.stdout.write(`${entry.name}${EOL}`)
  process.stdout.write(`  ${MUTED}url:${UI.Style.TEXT_NORMAL} ${entry.url}${EOL}`)
  if (entry.ref) process.stdout.write(`  ${MUTED}ref:${UI.Style.TEXT_NORMAL} ${entry.ref}${EOL}`)
  process.stdout.write(`  ${MUTED}status:${UI.Style.TEXT_NORMAL} ${configured ? "configured" : "known"}${EOL}`)
  process.stdout.write(EOL)
}

export const MarketplaceCommand = effectCmd({
  command: "marketplace <action> [name] [url]",
  aliases: ["market"],
  describe: "manage Kappa extension marketplaces",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "one of: list | add | remove",
        choices: ["list", "add", "remove"] as const,
        type: "string",
      })
      .positional("name", {
        describe: "marketplace name",
        type: "string",
      })
      .positional("url", {
        describe: "marketplace catalog url",
        type: "string",
      })
      .option("ref", {
        describe: "pin a tag/branch/sha (optional)",
        type: "string",
      })
      .option("manifest", {
        describe: `inline spec JSON: Kappa-native { "type": "...", "entry": "..." } or a Kilo plugin specifier`,
        type: "string",
      })
      .example("kappa marketplace list", "list known marketplace sources")
      .example("kappa marketplace add kappa-ext https://github.com/toxicwind/kappa-extensions", "add a source")
      .example("kappa marketplace remove kappa-ext", "remove a source"),
  handler: Effect.fn("Cli.marketplace")(function* (args) {
    const { action, name, url } = args as ActionInput
    switch (action) {
      case "list":
        return yield* listHandler()
      case "add":
        if (!name || !url) return yield* fail("marketplace add requires <name> and <url>")
        return yield* addHandler(args as ActionInput)
      case "remove":
        if (!name) return yield* fail("marketplace remove requires <name>")
        return yield* removeHandler(name)
      default:
        return yield* fail(`unknown marketplace action: ${String(action)}`)
    }
  }),
})

function listHandler(): Effect.Effect<void> {
  return Effect.sync(() => {
    UI.println(OK + "Configured marketplaces" + UI.Style.TEXT_NORMAL)
    void readConfigMarketplaces()
      .then((configured) => {
        const names = new Set(configured.map((item) => item.name))
        if (configured.length === 0) {
          process.stdout.write(`  ${MUTED}(none configured)${UI.Style.TEXT_NORMAL}${EOL}`)
        }
        for (const entry of configured) printEntry(entry, true)
        UI.println(EOL + OK + "Known marketplaces" + UI.Style.TEXT_NORMAL)
        return readRegistry().then((known) => {
          for (const entry of known) printEntry(entry, names.has(entry.name))
        })
      })
      .catch(() => {})
  })
}

function addHandler(args: ActionInput): Effect.Effect<void, CliError> {
  return Effect.gen(function* () {
    const manifest = parseManifest(args.manifest)
    const result = yield* runMarketplace(() =>
      addMarketplace({
        name: args.name,
        url: args.url,
        ref: args.ref || undefined,
        ...(manifest ? { manifest } : {}),
      }),
    )
    if (!result.ok) {
      return yield* fail(result.error, 1)
    }
    UI.println(OK + `Added marketplace "${args.name}"` + UI.Style.TEXT_NORMAL)
    process.stdout.write(`  ${MUTED}config:${UI.Style.TEXT_NORMAL} ${configPath()}${EOL}`)
  })
}

function removeHandler(name: string): Effect.Effect<void, CliError> {
  return Effect.gen(function* () {
    const result = yield* runMarketplace(() => removeMarketplace(name))
    if (!result.ok) {
      return yield* fail(result.error ?? `failed to remove "${name}"`, 1)
    }
    UI.println(OK + `Removed marketplace "${name}"` + UI.Style.TEXT_NORMAL)
  })
}

/** Run async marketplace work, converting thrown errors into a CliError. */
function runMarketplace<T>(fn: () => Promise<T>): Effect.Effect<T, CliError> {
  return Effect.tryPromise({
    try: fn,
    catch: (err) =>
      new CliError({ message: err instanceof Error ? err.message : "marketplace operation failed", exitCode: 1 }),
  })
}

/** Parse an optional inline manifest JSON; Kappa-native or a Kilo plugin string. */
function parseManifest(value: string | undefined): unknown {
  if (!value) return undefined
  const trimmed = value.trim()
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch (err) {
      throw new Error(`invalid --manifest JSON: ${err instanceof Error ? err.message : "parse error"}`)
    }
  }
  return trimmed
}
