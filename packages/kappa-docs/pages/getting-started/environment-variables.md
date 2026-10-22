---
title: "Environment Variables"
description: "A deconfused reference for KAPPA_* and OPENCODE_* environment variables"
---

# Environment Variables

Kappa reads configuration from environment variables at startup. This page is the authoritative reference and clarifies the **prefix taxonomy** that can otherwise be confusing:

| Prefix | Meaning | Example |
|---|---|---|
| `KAPPA_*` | Kappa's own runtime/build configuration | `KAPPA_DB`, `KAPPA_SERVER_PASSWORD`, `KAPPA_CONFIG` |
| `OPENCODE_*` | Interop with the **OpenCode provider** protocol | `OPENCODE_API_KEY`, `OPENCODE_TOOL_SCHEMAS` |
| Standard `*_API_KEY` | Third-party model providers | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |

> **Deconfusion note:** `OPENCODE_API_KEY` and `KAPPA_API_KEY` are **not** the same thing. `OPENCODE_API_KEY` authenticates the external OpenCode provider. `KAPPA_API_KEY` is used by the Kappa gateway/client for Kappa's own API. Set the one for the integration you use.

## Database

| Variable | Type | Description |
|---|---|---|
| `KAPPA_DB` | `string` | Override the SQLite session database. `":memory:"` for ephemeral, an absolute path, or a relative name resolved under `~/.local/share/kappa/`. |
| `KAPPA_CHANNEL` | `string` | Pin the build channel (defaults to the git branch). Controls the `kappa-<channel>.db` filename and the preview version string. |
| `KAPPA_DISABLE_CHANNEL_DB` | `bool` | Always use `kappa.db` instead of a channel-suffixed database. |

## Serve & remote access

| Variable | Type | Description |
|---|---|---|
| `KAPPA_SERVER_PASSWORD` | `string` | Password for the `kappa serve` HTTP server. |
| `KAPPA_SERVER_USERNAME` | `string` | Username for the `kappa serve` HTTP server. |

{% callout type="note" %}
The port the serve daemon binds is set by the estate wrapper as `KAPPA_SERVER_PORT` (default `25159`). It is an estate-level wrapper variable, not a core CLI flag.
{% /callout %}

## Configuration & startup

| Variable | Type | Description |
|---|---|---|
| `KAPPA_CONFIG` | `string` | Path to an explicit config file. |
| `KAPPA_CONFIG_CONTENT` | `string` | Inline config content. |
| `KAPPA_CONFIG_DIR` | `string` | Directory to resolve config and project files from. |
| `KAPPA_PLATFORM` | `string` | Platform tag (e.g. `vscode`, `jetbrains`, `cli`). |
| `KAPPA_VERSION` | `semver` | Bake a fixed version instead of the branch-based preview. |

## Build (used at compile time)

| Variable | Type | Description |
|---|---|---|
| `KAPPA_BUMP` | `patch\|minor\|major` | Trigger an automated version bump during `build.ts`. |
| `KAPPA_PRE_RELEASE` | `bool` | Treat the build as a pre-release (routes to `rc` channel). |
| `KAPPA_BWRAP_CACHE` | `string` | Cache dir for the vendored bubblewrap sandbox binary. |
| `KAPPA_NO_DAEMON` | `bool` | Disable daemonization for the CLI. |

## Behavior toggles (truthy: `true` / `1`)

| Variable | Description |
|---|---|
| `KAPPA_DISABLE_AUTOUPDATE` | Skip update checks. |
| `KAPPA_DISABLE_MODELS_FETCH` | Use the bundled models snapshot only (offline). |
| `KAPPA_DISABLE_TERMINAL_TITLE` | Do not rewrite the terminal title. |
| `KAPPA_DISABLE_CLAUDE_CODE` | Disable Claude Code compatibility shims. |
| `KAPPA_DISABLE_PRUNE` | Disable session pruning. |
| `KAPPA_DISABLE_SESSION_INGEST` | Disable session export/ingest telemetry. |
| `KAPPA_DISABLE_PROJECT_CONFIG` | Skip loading project-level config. |
| `KAPPA_DISABLE_PRESENCE` | Disable presence reporting. |
| `KAPPA_EXPERIMENTAL` | Master switch enabling experimental features. |

## Where your data lives

Sessions are stored in SQLite under `~/.local/share/kappa/`. The filename is `kappa-<channel>.db` — deterministic and non-empty for every build, so your history stays in one place. See [Session database](/docs/getting-started/troubleshooting/session-database) for the location, the stray-`kappa-.db` problem, and how to consolidate.

## Full schema

The complete, source-verified list of `KAPPA_*` variables is kept in [`.env.example`](https://github.com/Kappa-Org/kappacode/blob/main/.env.example) at the repo root. When a variable is not listed here, prefer the `.env.example`.

## Secrets handling

The estate's `kappa serve` wrapper injects `KAPPA_SERVER_PASSWORD` from the secretsmith keyring (freedesktop Secret Service). It is never committed to the repository. See [Secrets](/docs/deploy-secure/deploy) for how to manage server secrets.