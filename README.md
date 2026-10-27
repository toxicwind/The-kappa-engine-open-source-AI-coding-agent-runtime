[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-latest-blue?style=for-the-badge)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-latest-blue?style=for-the-badge)](https://typescriptlang.org)

<div align="center">

# ⚡ kappa

**The open source AI coding agent — VS Code, JetBrains, and the terminal, from one runtime.**

_Kappa (κ): a fork of [Kilo Code](https://github.com/Kilo-Org/kilo-code) (itself a fork of opencode) — a coding agent that meets you everywhere._

<p align="center">
  <a href="packages/kappa-console/">Explore the docs »</a>
  ·
  <a href="packages/kappa-vscode/">VS Code</a>
  ·
  <a href="packages/kappa-jetbrains/">JetBrains</a>
  ·
  <a href="packages/cli/">CLI</a>
</p>

</div>

## ⚡ The kappa, in one picture

```mermaid
flowchart TB
    subgraph vscode["📝 VS Code"]
        VSC["kappa VS Code extension\n@kappacode/vscode"]
    end
    subgraph jetbrains["🎨 JetBrains"]
        JB["kappa JetBrains plugin\n@kappacode/jetbrains"]
    end
    subgraph cli["⌨️ CLI / TUI"]
        CLI["@kappacode/cli\nbinary: kappa"]
    end
    subgraph runtime["⚙️ Runtime"]
        CORE["@kappacode/core\nproviders · plugins · config\nsessions · models · MCP"]
        GATE["@kappacode/kappa-gateway\nmodel routing\nprovider auth"]
    end
    VSC --> CORE
    JB --> CORE
    CLI --> CORE
    CORE --> GATE
```

## 🧭 Table of Contents

1. [The kappa in one picture](#-the-kappa-in-one-picture)
2. [Try it](#-try-it-5-commands)
3. [About](#-about)
4. [The monorepo](#-the-monorepo)
5. [Build](#-build)
6. [Tooling integration](#-tooling-integration)
7. [Fork features](#-fork-features)
8. [Getting started](#-getting-started)
9. [Contributing](#-contributing)
10. [License](#license)

## 🔍 Try it (5 commands)

```bash
# 1. Check kappa CLI version
kappa --version

# 2. Start the interactive TUI
kappa

# 3. One-shot prompt from the shell
kappa run "explain this repo in one paragraph"

# 4. List workspace packages
bun pm ls

# 5. Build the CLI binary
bun run --cwd packages/cli script/build.ts --single --skip-install
```

## 🏔️ About

**kappa** is a fork of [Kilo Code](https://github.com/Kilo-Org/kilo-code), reorganized as a proper bun workspaces monorepo with the `@kappacode/*` scope. Every subproject — editor extensions, CLI, gateway, build tooling, secret management — lives under `packages/` and is versioned and linked.

What it takes to run a serious AI coding agent:

- **A unified runtime** that treats every workspace (VS Code, JetBrains, CLI) as first-class. `@kappacode/core` owns the model routing, plugin system, session management, and MCP server lifecycle.
- **A gateway** for provider routing and auth. `@kappacode/kappa-gateway` sits in front of model providers, handling key rotation, rate limiting, and health checks.
- **Build tooling as packages.** `@kappacode/forge` and `@kappacode/nativelink` integrate remote build caching through standard Bun/mise task routes — not external build scripts.
- **Secrets out of config files.** `@kappacode/secretsmith` reads provider keys from the OS keyring (freedesktop Secret Service via D-Bus). No secrets in config commits.
- **Shell integration.** `@kappacode/shims` provides git hooks, env-sanity fixes, and ble.sh prompt units.

### Built with

TypeScript (Bun) · Effect · Solid.js · Hono · Turborepo · Zig · Rust

## 🐝 The monorepo

All projects live under `packages/`. The bun workspace resolves dependencies across the entire tree.

| Package     | Path                        | Scope                      | What it is                                                 |
| ----------- | --------------------------- | -------------------------- | ---------------------------------------------------------- |
| Core        | `packages/core/`            | `@kappacode/core`          | Runtime: providers, plugins, config, sessions, models, MCP |
| CLI         | `packages/cli/`             | `@kappacode/cli`           | The standalone CLI binary (`kappa` command)                |
| Gateway     | `packages/kappa-gateway/`   | `@kappacode/kappa-gateway` | HTTP API gateway for model routing                         |
| VS Code     | `packages/kappa-vscode/`    | `@kappacode/vscode`        | VS Code extension                                          |
| JetBrains   | `packages/kappa-jetbrains/` | `@kappacode/jetbrains`     | JetBrains plugin                                           |
| Console     | `packages/kappa-console/`   | `@kappacode/kappa-console` | Settings UI (providers, models, keybindings, MCP)          |
| Docs        | `packages/kappa-docs/`      | `@kappacode/kappa-docs`    | Documentation site                                         |
| UI          | `packages/ui/`              | `@kappacode/ui`            | Shared component library                                   |
| Forge       | `packages/forge/`           | `@kappacode/forge`         | Build daemon integration                                   |
| Nativlink   | `packages/nativelink/`      | `@kappacode/nativelink`    | Remote build cache (Nativelink RE API)                     |
| Secretsmith | `packages/secretsmith/`     | `@kappacode/secretsmith`   | Secret management (OS keyring)                             |
| Shims       | `packages/shims/`           | `@kappacode/shims`         | System shims (git hooks, env fix, prompt units)            |
| Config      | `packages/config/`          | `@kappacode/config`        | Configuration schemas & validation                         |
| Protocol    | `packages/protocol/`        | `@kappacode/protocol`      | Wire protocol definitions                                  |
| Schema      | `packages/schema/`          | `@kappacode/schema`        | JSON schema definitions                                    |
| SDK         | `packages/sdk/`             | `@kappacode/sdk`           | JS/TS SDK                                                  |

## 🔧 Build

### CLI binary

```bash
# Full build (requires Zig for bubblewrap)
bun install && bun run --cwd packages/cli script/build.ts

# Single platform build
bun run --cwd packages/cli script/build.ts --single --skip-install

# Output → packages/cli/dist/@kappacode/cli-linux-x64/bin/kappa
```

### All packages

```bash
bun install                    # workspace deps
bun run typecheck              # all packages
bun run build                  # build all packages
```

### Remote-cached build route

`bun run make:nativelink` builds through the mise `kappa-build` task with remote
build caching (mise `[task_config.cache]` in `mise.toml` is the SSOT;
`BUN_BUILD_REMOTE_CACHE` is dead code). The plain `bun run make` route builds
locally.

## 🧰 Tooling integration

- **Forge** — build daemon integration (`@kappacode/forge`)
- **Nativelink** — remote execution / cache RE API (`@kappacode/nativelink`)
- **Secretsmith** — OS-keyring secret management (`@kappacode/secretsmith`)
- **Mise** — task runner with remote cache (`mise.toml`)
- **`kappa` wrapper** — `packages/cli/bin/kappa` resolves the local compiled
  artifact in `dist/` before falling back to global discovery or platform
  packages

### 🏷️ Dynamic Versioning & Resolution

Runtime and build versions correlate via `packages/script`:

- **Release tags / git branch** — preview builds format dynamically as `0.0.0-<branch>-<timestamp>` (e.g. `0.0.0-main-20261019...`) unless `KAPPA_VERSION` or `KAPPA_BUMP` is specified.
- **Explicit version override** — pass `KAPPA_VERSION=x.y.z` to bake a non-preview semver directly into compilation, or trigger an automated bump via `KAPPA_BUMP=patch|minor|major`.
- **Execution resolution** — the wrapper in `packages/cli/bin/kappa` resolves `.kappa` (pointing to the local compiled artifact in `dist/`) before falling back to global discovery or platform packages.

See [`.env.example`](.env.example) for the full, source-verified list of `KAPPA_*` environment variables.

### 💾 Stable session database

Sessions live in `~/.local/share/kappa/kappa-<token>.db`, where `<token>` is the **build channel** (git branch by default), sanitized by `safeChannelToken()` in `packages/core/src/installation/version.ts`.

- **Deterministic, non-empty names** — a local/dev build made from a detached HEAD or branch-less git context previously sanitized the channel to `""`, silently forking the session database into `kappa-.db` and making sessions look "lost" (split away from `kappa-main.db`). `safeChannelToken()` falls back to a stable `dev` for empty/meaningless channels, so every build resolves to one predictable filename.
- **One resolver for both layers** — the core (`packages/core/src/database/database.ts`) and the CLI (`packages/cli/src/storage/db.ts`) path resolvers share a single helper, so they can never disagree on which file to open.
- **Idempotent migrations** — the `kappa_board` / `kappa_board_message` / model-usage-index migrations are replay-safe (`IF NOT EXISTS` / `cleared_seq` guard): replaying them against an existing database no longer crashes with `table kappa_board_message already exists`.

## ⚡ Fork features

Two model-resilience features on top of upstream, both serving the same idea:
**never trust what a provider claims — measure what the endpoint actually does.**

- **Browser-fingerprint HTTP transport** — reach Cloudflare-guarded providers
  by forwarding with Chrome-aligned headers. Opt in per provider with
  `"http": { "fingerprint": "chrome" }`.
- **Flail Gate** — model-agnostic loop/narration resilience: stops agents from
  repeating tool calls, narrating instead of acting, or re-deriving the same
  reasoning. Config lives in `~/.config/kappa/flail-gate/gate.json`.

See the [parent repo README](https://github.com/toxicwind/kappa#fork-features)
for full details and implementation links.

## 🚀 Getting started

```bash
git clone https://github.com/toxicwind/kappa-code.git
cd kappa-code
bun install
bun run typecheck
```

## 📝 Contributing

1. Fork
2. `bun install`
3. Make changes in the relevant `packages/*`
4. `bun run typecheck` + `bun test`
5. PR

## License

MIT
