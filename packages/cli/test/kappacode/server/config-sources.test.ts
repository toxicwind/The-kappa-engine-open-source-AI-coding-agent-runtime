import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Flag } from "@opencode-ai/core/flag/flag"
import * as Log from "@opencode-ai/core/util/log"
import { Server } from "../../../src/server/server.ts"
import { resetDatabase } from "../../fixture/db.ts"
import { disposeAllInstances, tmpdir } from "../../fixture/fixture.ts"

void Log.init({ print: false })

type Source = {
  order: number
  kind: string
  scope: string
  label: string
  source: string
  path?: string
  exists: boolean
  editable: boolean
  reason?: string
}

type Body = {
  sources: Source[]
}

const env = {
  KAPPA_CONFIG: process.env.KAPPA_CONFIG,
  KAPPA_CONFIG_CONTENT: process.env.KAPPA_CONFIG_CONTENT,
  KAPPA_CONFIG_DIR: process.env.KAPPA_CONFIG_DIR,
  KAPPA_DISABLE_PROJECT_CONFIG: process.env.KAPPA_DISABLE_PROJECT_CONFIG,
  KAPPA_TEST_MANAGED_CONFIG_DIR: process.env.KAPPA_TEST_MANAGED_CONFIG_DIR,
  flagConfig: Flag.KAPPA_CONFIG,
}

afterEach(async () => {
  restore()
  await disposeAllInstances()
  await resetDatabase()
})

function restore() {
  set("KAPPA_CONFIG", env.KAPPA_CONFIG)
  set("KAPPA_CONFIG_CONTENT", env.KAPPA_CONFIG_CONTENT)
  set("KAPPA_CONFIG_DIR", env.KAPPA_CONFIG_DIR)
  set("KAPPA_DISABLE_PROJECT_CONFIG", env.KAPPA_DISABLE_PROJECT_CONFIG)
  set("KAPPA_TEST_MANAGED_CONFIG_DIR", env.KAPPA_TEST_MANAGED_CONFIG_DIR)
  Flag.KAPPA_CONFIG = env.flagConfig
}

function set(key: keyof typeof process.env, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

async function sources(dir: string) {
  const response = await Server.Default().app.request("/config/sources", {
    headers: { "x-kappa-directory": dir },
  })
  expect(response.status).toBe(200)
  return (await response.json()) as Body
}

function order(body: Body, file: string) {
  const hit = body.sources.find((source) => source.path === file)
  expect(hit).toBeDefined()
  return hit!.order
}

describe("config source routes", () => {
  test("lists source metadata in load order without config contents", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "env.json"), "{}")
        await Bun.write(path.join(dir, "kappa.json"), "{}")

        for (const root of [".opencode", ".kappacode", ".kappa"]) {
          const local = path.join(dir, root)
          await fs.mkdir(local, { recursive: true })
          await Bun.write(path.join(local, "kappa.jsonc"), "{}")
        }

        const extra = path.join(dir, "extra")
        await fs.mkdir(extra, { recursive: true })
        await Bun.write(path.join(extra, "opencode.json"), "{}")

        const managed = path.join(dir, "managed")
        await fs.mkdir(managed, { recursive: true })
        await Bun.write(path.join(managed, "kappa.json"), "{}")
      },
    })

    const envFile = path.join(tmp.path, "env.json")
    const projectFile = path.join(tmp.path, "kappa.json")
    const opencodeFile = path.join(tmp.path, ".opencode", "kappa.jsonc")
    const kappacodeFile = path.join(tmp.path, ".kappacode", "kappa.jsonc")
    const configFile = path.join(tmp.path, ".kappa", "kappa.jsonc")
    const extraFile = path.join(tmp.path, "extra", "opencode.json")
    const managedFile = path.join(tmp.path, "managed", "kappa.json")

    process.env.KAPPA_CONFIG = envFile
    Flag.KAPPA_CONFIG = envFile
    process.env.KAPPA_CONFIG_CONTENT = '{"username":"secret-inline-value"}'
    process.env.KAPPA_CONFIG_DIR = path.join(tmp.path, "extra")
    process.env.KAPPA_TEST_MANAGED_CONFIG_DIR = path.join(tmp.path, "managed")

    const body = await sources(tmp.path)
    const inline = body.sources.find((source) => source.source === "KAPPA_CONFIG_CONTENT")

    expect(order(body, envFile)).toBeLessThan(order(body, projectFile))
    expect(order(body, projectFile)).toBeLessThan(order(body, kappacodeFile))
    expect(order(body, kappacodeFile)).toBeLessThan(order(body, configFile))
    expect(body.sources.some((source) => source.path === opencodeFile)).toBe(false)
    expect(order(body, configFile)).toBeLessThan(order(body, extraFile))
    expect(inline?.order).toBeGreaterThan(order(body, extraFile))
    expect(inline?.order).toBeLessThan(order(body, managedFile))

    expect(body.sources.find((source) => source.path === configFile)).toMatchObject({
      kind: "config-dir-file",
      scope: "project",
      exists: true,
      editable: true,
    })
    expect(body.sources.find((source) => source.path === managedFile)).toMatchObject({
      kind: "managed-file",
      scope: "managed",
      exists: true,
      editable: false,
    })
    expect(JSON.stringify(body)).not.toContain("secret-inline-value")
  })

  test("shows project config disabled by environment", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "kappa.json"), "{}")
        await fs.mkdir(path.join(dir, ".kappa"), { recursive: true })
        await Bun.write(path.join(dir, ".kappa", "kappa.json"), "{}")
      },
    })

    process.env.KAPPA_DISABLE_PROJECT_CONFIG = "1"

    const body = await sources(tmp.path)

    expect(body.sources.some((source) => source.path === path.join(tmp.path, "kappa.json"))).toBe(false)
    expect(body.sources.some((source) => source.path === path.join(tmp.path, ".kappa", "kappa.json"))).toBe(false)
    expect(body.sources.find((source) => source.source === "KAPPA_DISABLE_PROJECT_CONFIG")).toMatchObject({
      kind: "runtime-env",
      scope: "env",
      exists: true,
      editable: false,
    })
  })
})
