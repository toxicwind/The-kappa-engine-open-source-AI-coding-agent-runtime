import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth.ts"

const original = {
  KAPPA_SERVER_PASSWORD: Flag.KAPPA_SERVER_PASSWORD,
  KAPPA_SERVER_USERNAME: Flag.KAPPA_SERVER_USERNAME,
}

afterEach(() => {
  Flag.KAPPA_SERVER_PASSWORD = original.KAPPA_SERVER_PASSWORD
  Flag.KAPPA_SERVER_USERNAME = original.KAPPA_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.KAPPA_SERVER_PASSWORD = undefined
    Flag.KAPPA_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the kappa username", () => {
    // kappacode_change
    Flag.KAPPA_SERVER_PASSWORD = "secret"
    Flag.KAPPA_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("kappa:secret").toString("base64")}`, // kappacode_change
    })
  })

  test("uses the configured username", () => {
    Flag.KAPPA_SERVER_PASSWORD = "secret"
    Flag.KAPPA_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.KAPPA_SERVER_PASSWORD = "secret"
    Flag.KAPPA_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "kappa", password: Redacted.make("secret") }, config)).toBe(false) // kappacode_change
  })
})
