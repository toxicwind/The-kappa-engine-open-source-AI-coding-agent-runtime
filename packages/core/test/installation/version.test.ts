import { describe, expect, test } from "bun:test"
import { InstallationChannel, safeChannelToken } from "@opencode-ai/core/installation/version"

describe("safeChannelToken", () => {
  // kappacode_change start
  // Regression: the database path resolvers derive `kappa-<token>.db` from the
  // installation channel. A channel that sanitizes to an empty token produces
  // `kappa-.db`, silently splitting the session database away from `kappa-main.db`.
  test("falls back to a stable token for an empty channel", () => {
    expect(safeChannelToken("")).toBe("dev")
    expect(safeChannelToken("!!")).toBe("dev")
  })

  test("sanitizes illegal characters but keeps a stable name", () => {
    expect(safeChannelToken("feature/foo bar")).toBe("feature-foo-bar")
    expect(safeChannelToken("-")).toBe("dev")
    expect(safeChannelToken("!!&&##")).toBe("dev")
  })

  test("round-trips the built channel", () => {
    const token = safeChannelToken(InstallationChannel)
    expect(token.length).toBeGreaterThan(0)
    expect(/^[a-zA-Z0-9._-]+$/.test(token)).toBe(true)
  })
  // kappacode_change end
})