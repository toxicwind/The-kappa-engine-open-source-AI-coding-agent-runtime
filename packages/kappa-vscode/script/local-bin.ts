#!/usr/bin/env bun
import { $ } from "bun"
import { createHash } from "node:crypto"
import { join, relative, dirname, basename } from "node:path"
import { chmodSync, statSync, rmSync, readdirSync, existsSync } from "node:fs"
import {
  copyKappaSandboxWorker,
  copySandboxResources,
  copyTreeSitterResources,
  hasKappaSandboxWorker,
  hasTreeSitterResources,
  kappaSandboxWorkerForBinary,
  sanitizeSandboxResources,
} from "../src/services/cli-backend/cli-resources"
import { currentBwrapTarget, ensureBwrapForTarget } from "./bwrap-helper"
import { currentFfmpegTarget, ensureFfmpegForTarget } from "./ffmpeg-helper"

const forceRebuild = process.argv.includes("--force")
const compiledOnly = process.argv.includes("--compiled")

/**
 * Ensures the VS Code extension has a CLI binary at `packages/kappa-vscode/bin/kappa`.
 *
 * Strategy:
 * 1) If `bin/kappa` already exists -> ok.
 * 2) Else try to locate a prebuilt binary produced by `packages/opencode` build.
 * 3) Else try to build it via `bun run build --single` in `packages/opencode`.
 * 4) Copy the resulting binary into `packages/kappa-vscode/bin/kappa` and chmod +x.
 *
 * This script is intended to be run from `packages/kappa-vscode` as part of build/package.
 */

const kappaVscodeDir = join(import.meta.dir, "..")
const packagesDir = join(kappaVscodeDir, "..")
const repoDir = join(packagesDir, "..")
const opencodeDir = join(packagesDir, "opencode")
const sandboxDir = join(packagesDir, "kappa-sandbox")
const rootFile = join(repoDir, "package.json")

const targetBinDir = join(kappaVscodeDir, "bin")
const binName = process.platform === "win32" ? "kappa.exe" : "kappa"
const targetBinPath = join(targetBinDir, binName)
const versionFile = join(kappaVscodeDir, "node_modules", ".kappa-cli-version")

function log(msg: string) {
  console.log(`[local-bin] ${msg}`)
}

type Package = {
  name?: string
  workspaces?: string[] | { packages?: string[] }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

async function cliInputs() {
  const root: Package = await Bun.file(rootFile).json()
  const workspaces = Array.isArray(root.workspaces) ? root.workspaces : (root.workspaces?.packages ?? [])
  const files = (
    await Promise.all(
      workspaces.map((pattern) =>
        Array.fromAsync(new Bun.Glob(`${pattern}/package.json`).scan({ cwd: repoDir, onlyFiles: true })),
      ),
    )
  ).flat()
  const entries = await Promise.all(
    files.map(async (file) => ({ file, pkg: (await Bun.file(join(repoDir, file)).json()) as Package })),
  )
  const packages = new Map(entries.flatMap((entry) => (entry.pkg.name ? [[entry.pkg.name, entry] as const] : [])))
  const dirs = new Set<string>()

  function visit(name: string) {
    const entry = packages.get(name)
    if (!entry) return
    const dir = dirname(entry.file)
    if (dirs.has(dir)) return
    dirs.add(dir)
    const deps = {
      ...entry.pkg.dependencies,
      ...entry.pkg.devDependencies,
      ...entry.pkg.optionalDependencies,
      ...entry.pkg.peerDependencies,
    }
    for (const dep of Object.keys(deps)) visit(dep)
  }

  // The CLI build embeds the console even though it is not a package dependency.
  for (const dir of [opencodeDir, join(packagesDir, "kappa-console")]) {
    const pkg: Package = await Bun.file(join(dir, "package.json")).json()
    if (!pkg.name) throw new Error(`Workspace package at ${dir} has no name`)
    visit(pkg.name)
  }

  return [
    relative(repoDir, rootFile),
    "bun.lock",
    "patches",
    ...[...dirs].sort(),
    "packages/kappa-vscode/script/bwrap-helper.ts",
    "packages/kappa-vscode/script/ffmpeg-helper.ts",
    "packages/kappa-vscode/script/local-bin.ts",
    "packages/kappa-vscode/src/services/cli-backend/cli-resources.ts",
  ]
}

async function cliSourceHash() {
  try {
    const inputs = await cliInputs()
    const [tree, diff, extra, branch] = await Promise.all([
      $`git ls-tree -r HEAD -- ${inputs}`.cwd(repoDir).quiet(),
      $`git diff --binary HEAD -- ${inputs}`.cwd(repoDir).quiet(),
      $`git ls-files --others --exclude-standard -z -- ${inputs}`.cwd(repoDir).quiet(),
      $`git branch --show-current`.cwd(repoDir).quiet(),
    ])
    const env = Object.fromEntries(
      [
        "GH_REPO",
        "KAPPA_BUMP",
        "KAPPA_BWRAP_CACHE",
        "KAPPA_CHANNEL",
        "KAPPA_MODELS_URL",
        "KAPPA_PRE_RELEASE",
        "KAPPA_RELEASE",
        "KAPPA_SKIP_BUNDLED_BWRAP",
        "KAPPA_VERSION",
        "MODELS_DEV_API_JSON",
        "ZIG",
      ].map((key) => [key, process.env[key] ?? ""]),
    )
    const hash = createHash("sha256")
      .update(tree.text())
      .update(diff.text())
      .update(branch.text())
      .update(JSON.stringify(env))
    const files = extra.text().split("\0").filter(Boolean).sort()

    for (const file of files) {
      hash.update(file)
      hash.update(new Uint8Array(await Bun.file(join(repoDir, file)).arrayBuffer()))
    }

    const models = process.env.MODELS_DEV_API_JSON
    if (models) hash.update(new Uint8Array(await Bun.file(models).arrayBuffer()))
    return hash.digest("hex")
  } catch (err) {
    log(`Could not determine CLI source hash: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

async function isStale() {
  const hash = await cliSourceHash()
  if (!hash) {
    if (!compiledOnly) return false
    try {
      const stored: unknown = await Bun.file(versionFile).json()
      return Reflect.get(stored, "kind") !== "compiled"
    } catch {
      return true
    }
  }
  try {
    const stored: unknown = await Bun.file(versionFile).json()
    if (!stored || typeof stored !== "object") return true
    const input = Reflect.get(stored, "input")
    const target = Reflect.get(stored, "target")
    const kind = Reflect.get(stored, "kind")
    return input !== hash || target !== platformTag() || (compiledOnly && kind !== "compiled")
  } catch {
    return true // no version file — treat as stale
  }
}

async function writeVersion(kind: "compiled" | "wrapper") {
  const input = await cliSourceHash()
  if (!input) {
    rmSync(versionFile, { force: true })
    return
  }
  await Bun.write(versionFile, JSON.stringify({ input, target: platformTag(), kind }) + "\n")
}

function platformTag(): string {
  const os = process.platform === "win32" ? "windows" : process.platform
  return `cli-${os}-${process.arch}`
}

async function findKappaBinaryInOpencodeDist(): Promise<string | null> {
  const distDir = join(opencodeDir, "dist")

  try {
    readdirSync(distDir)
  } catch {
    return null
  }

  // Prefer the binary matching the current platform (e.g. cli-darwin-arm64)
  const tag = platformTag()
  const preferred = join(distDir, `@kappacode`, tag, "bin", binName)
  try {
    statSync(preferred)
    if (!hasTreeSitterResources(preferred) || !hasKappaSandboxWorker(preferred)) return null
    return preferred
  } catch {
    // fall through to generic search
  }

  if (compiledOnly) return null

  // Fallback: find any dist/**/bin/kappa or kappa.exe
  const queue = [distDir]
  while (queue.length) {
    const dir = queue.pop()
    if (!dir) continue

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        queue.push(p)
        continue
      }
      if (e.isFile() && (e.name === "kappa" || e.name === "kappa.exe") && basename(dirname(p)) === "bin") {
        if (!hasTreeSitterResources(p) || !hasKappaSandboxWorker(p)) continue
        return p
      }
    }
  }
  return null
}

async function ensureBuiltBinary(): Promise<string> {
  const found = await findKappaBinaryInOpencodeDist()
  if (found) return found

  log(
    `No prebuilt binary found under ${relative(kappaVscodeDir, join(opencodeDir, "dist"))} - attempting build via bun.`,
  )

  if (!Bun.which("bun")) {
    throw new Error(
      `Bun is required to build the CLI binary, but was not found on PATH. ` +
        `Install bun, or build the CLI separately in ${opencodeDir} and re-run.`,
    )
  }

  const pkg = await Bun.file(join(repoDir, "package.json")).json()
  const bun = String(pkg.packageManager)
  log("Building CLI binary...")
  try {
    await $`bunx ${bun} run build --single --skip-install`.cwd(opencodeDir)
  } catch (err) {
    log(`Pinned bunx build failed (${err}), running via active bun runtime...`)
    await $`bun run script/build.ts --single --skip-install`.cwd(opencodeDir)
  }

  const built = await findKappaBinaryInOpencodeDist()
  if (!built) {
    throw new Error(
      `CLI build completed but no binary was found in ${join(opencodeDir, "dist")} (expected dist/**/bin/kappa).`,
    )
  }
  return built
}

async function bundleKappaSandboxWorker() {
  const result = await Bun.build({
    entrypoints: [join(sandboxDir, "src", "kappa-sandbox-mutation-worker.ts")],
    target: "bun",
    format: "esm",
    minify: true,
  })
  if (!result.success || result.outputs.length !== 1) throw new Error("Could not bundle Kappa sandbox mutation worker")
  await Bun.write(kappaSandboxWorkerForBinary(targetBinPath), result.outputs[0])
}

async function ensureLocalHelpers() {
  await ensureFfmpegForTarget(currentFfmpegTarget(), targetBinDir)
  if (process.env.KAPPA_SKIP_BUNDLED_BWRAP === "1") return
  if (await sanitizeSandboxResources(targetBinDir, true)) return
  await ensureBwrapForTarget(currentBwrapTarget())
}

async function writeSourceWrapper() {
  if (process.platform === "win32") {
    throw new Error("Compiled CLI build failed and source wrapper fallback is not supported on Windows.")
  }

  const bun = Bun.which("bun") ?? "bun"
  await $`mkdir -p ${targetBinDir}`
  await Bun.write(
    targetBinPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `cd ${JSON.stringify(opencodeDir)}`,
      `exec ${JSON.stringify(bun)} --conditions=node src/index.ts "$@"`,
      "",
    ].join("\n"),
  )
  chmodSync(targetBinPath, 0o755)
  await bundleKappaSandboxWorker()
  await ensureLocalHelpers()

  await writeVersion("wrapper")
  log(
    `Compiled CLI build failed; wrote source wrapper at ${relative(kappaVscodeDir, targetBinPath)} for local development.`,
  )
}

async function main() {
  for (const file of [join(targetBinDir, ".cli-version"), join(targetBinDir, ".ffmpeg-target")]) {
    rmSync(file, { force: true })
  }
  const targetFile = Bun.file(targetBinPath)
  const exists = await targetFile.exists()
  const ready = exists && hasTreeSitterResources(targetBinPath) && hasKappaSandboxWorker(targetBinPath)

  const stale = ready && !forceRebuild && (await isStale())
  const rebuild = forceRebuild || stale || !ready

  if (ready && !rebuild) {
    const st = statSync(targetBinPath)
    log(
      `CLI binary already present at ${relative(kappaVscodeDir, targetBinPath)} (${Math.round(st.size / 1024 / 1024)}MB). Use --force to rebuild.`,
    )
    await ensureLocalHelpers()
    return
  }

  if ((forceRebuild || compiledOnly) && !ready) {
    removeDist()
  }

  if (exists && rebuild) {
    log(stale ? `CLI source has changed — rebuilding.` : `Refreshing existing CLI resources.`)
    rmSync(targetBinPath)
    if (forceRebuild || stale || !ready) {
      removeDist()
    }
  }

  const opencodePkgFile = Bun.file(join(opencodeDir, "package.json"))
  if (!(await opencodePkgFile.exists())) {
    throw new Error(`Expected opencode package at ${opencodeDir}, but it does not exist.`)
  }

  const sourceBinPath = await ensureBuiltBinary().catch(async (err) => {
    if (forceRebuild || compiledOnly) throw err
    await writeSourceWrapper()
    log(`Wrapper fallback reason: ${err instanceof Error ? err.message : String(err)}`)
    return null
  })
  if (!sourceBinPath) return
  await $`mkdir -p ${targetBinDir}`
  await $`cp ${sourceBinPath} ${targetBinPath}`
  await copyTreeSitterResources(sourceBinPath, targetBinPath)
  await copySandboxResources(sourceBinPath, targetBinPath)
  await copyKappaSandboxWorker(sourceBinPath, targetBinPath)
  chmodSync(targetBinPath, 0o755)
  await ensureLocalHelpers()

  await writeVersion("compiled")

  log(`Copied CLI binary from ${relative(packagesDir, sourceBinPath)} -> ${relative(kappaVscodeDir, targetBinPath)}`)
}

function removeDist() {
  // Also remove the prebuilt dist so ensureBuiltBinary() triggers a fresh build
  const distDir = join(opencodeDir, "dist")
  if (!existsSync(distDir)) return
  rmSync(distDir, { recursive: true })
  log(`Removed ${relative(kappaVscodeDir, distDir)} to force rebuild.`)
}

try {
  await main()
} catch (err) {
  console.error(`[local-bin] ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
