Use Kappa Code directly from your terminal for maximum flexibility.

### Install via npm

```bash
npm install -g @kappacode/cli
```

### Install from source (estate / dev builds)

The fork's CLI is built locally through the `kappa-build` mise task, which is remote-cached by the Forge build daemon (`:25148`).

```bash
# From the repo root - single binary build
bun run make:nativelink

# Output
# packages/cli/dist/@kappacode/cli-<platform>-x64/bin/kappa
```

Once built, the binary is wired in so `kappa` resolves to it:

| Resolution step | Path |
|---|---|
| Repo wrapper | `packages/cli/bin/kappa` |
| Cached artifact link | `packages/cli/bin/.kappa` → `dist/@kappacode/cli-<platform>-x64/bin/kappa` |
| On-PATH fallback | `~/.local/bin/kappa` (or `/usr/bin/kappa`) |

The wrapper resolves `.kappa` (the local compiled artifact in `dist/`) before falling back to global discovery or platform packages.

{% callout type="note" %}
Everything runs in source form via `bun run --conditions=browser ./src/index.ts` during development; `make:nativelink` produces the standalone binary.
{% /callout %}

### Older CPUs (No AVX Support)

If you're running on an older CPU without AVX support (e.g., Intel Xeon Nehalem, AMD Bulldozer, or older), the CLI may crash with "Illegal instruction". In that case, download the **baseline** variant from GitHub releases:

1. Go to [Kappa Releases](https://github.com/Kappa-Org/kappacode/releases)
2. Download the `-baseline` variant for your platform:
   - Linux x64: `kappa-linux-x64-baseline.tar.gz`
   - macOS x64: `kappa-darwin-x64-baseline.zip`
   - Windows x64: `kappa-windows-x64-baseline.zip`
3. Extract and run the `kappa` binary directly

### Verify Installation

```bash
kappa --version
```

### Where your data lives

Sessions are stored in `~/.local/share/kappa/` as `kappa-<channel>.db`, where `<channel>` is the build channel (git branch by default). The name is deterministic and non-empty for every build, so your history stays in **one** database. If you ever see a stray `kappa-.db`, see [Session database troubleshooting](/docs/getting-started/troubleshooting/session-database).
