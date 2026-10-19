#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

await Bun.build({
  target: "node",
  // kappacode_change start
  entrypoints: [
    "./src/node.ts",
    "../kappa-sandbox/src/kappa-sandbox-mutation-worker.ts",
    "../kappa-sandbox/src/kappa-sandbox-network-relay.ts",
  ],
  // kappacode_change end
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    KAPPA_MODELS_DEV: generated.modelsData,
    KAPPA_VERSION: `'${Script.version}'`, // kappacode_change
    KAPPA_SANDBOX_MUTATION_WORKER_PATH: `'./kappa-sandbox-mutation-worker.js'`, // kappacode_change
    KAPPA_SANDBOX_NETWORK_RELAY_PATH: `'./kappa-sandbox-network-relay.js'`, // kappacode_change
    KAPPA_SANDBOX_SECCOMP_PATH: "undefined", // kappacode_change
    KAPPA_CHANNEL: `'${Script.channel}'`,
  },
  files: {
    "opencode-web-ui.gen.ts": "",
  },
})

console.log("Build complete")
