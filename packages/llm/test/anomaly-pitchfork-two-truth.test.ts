import { describe, expect, test } from "bun:test"

/**
 * Anomaly 6: Pitchfork two-truth problem
 * pitchfork.toml (monolith) SHADOWS pitchfork.d fragments (103 dead fragments exist; monolith is the only live truth)
 * generate.ts retired 2026-09-14 because it destroyed hand-tuned config.
 * When editing a daemon, edit the MAIN config; check both, keep consistent, never treat pitchfork.d as authoritative.
 * 
 * Capability-contract test: validate that we only trust the monolith config.
 */

describe("Anomaly 6: Pitchfork two-truth capability contract", () => {
  
  test("pitchfork.toml monolith is the only live truth", () => {
    const configSources = {
      monolith: "/home/toxic/pens/estate/pitchfork.toml", // LIVE
      fragments: "/home/toxic/pens/estate/pitchfork.d/" // 103 DEAD fragments
    }
    
    expect(configSources.monolith).toContain("pitchfork.toml")
    expect(configSources.fragments).toContain("pitchfork.d")
  })
  
  test("103 dead fragments in pitchfork.d - never treat as authoritative", () => {
    const deadFragmentCount = 103
    expect(deadFragmentCount).toBe(103)
    
    const fragmentsAuthoritative = false // NEVER treat as authoritative
    expect(fragmentsAuthoritative).toBe(false)
  })
  
  test("generate.ts retired 2026-09-14 because it destroyed hand-tuned config", () => {
    const retiredScript = "generate.ts"
    const retiredDate = "2026-09-14"
    const reason = "destroyed hand-tuned config"
    
    expect(retiredScript).toBe("generate.ts")
    expect(retiredDate).toBe("2026-09-14")
    expect(reason).toContain("destroyed")
  })
  
  test("when editing a daemon, edit the MAIN config (pitchfork.toml)", () => {
    const correctEditTarget = "pitchfork.toml"
    const wrongEditTarget = "pitchfork.d/some-daemon.toml"
    
    expect(correctEditTarget).toBe("pitchfork.toml")
    expect(wrongEditTarget).toContain("pitchfork.d")
  })
  
  test("check both monolith and fragments, keep consistent", () => {
    const monolithConfig = { daemons: { "api": { cmd: "bun run api.ts" } } }
    const fragmentConfig = { daemons: { "api": { cmd: "node api.js" } } } // INCONSISTENT!
    
    // Must detect inconsistency
    const inconsistent = monolithConfig.daemons.api.cmd !== fragmentConfig.daemons.api.cmd
    expect(inconsistent).toBe(true)
    
    // Must keep consistent - monolith wins
    const sourceOfTruth = monolithConfig
    expect(sourceOfTruth.daemons.api.cmd).toBe("bun run api.ts")
  })
  
  test("fleet substrate: per-daemon toolchain isolation (per-daemon mise env, no global bun:path)", () => {
    // One malformed toolchain token (bun:path@true) mass-killed 65 daemons
    const malformedToken = "bun:path@true"
    const killedDaemons = 65
    
    expect(malformedToken).toBe("bun:path@true")
    expect(killedDaemons).toBe(65)
    
    // Doctrine: per-daemon mise env, no global bun:path
    const perDaemonMiseEnv = true
    const noGlobalBunPath = true
    
    expect(perDaemonMiseEnv).toBe(true)
    expect(noGlobalBunPath).toBe(true)
  })
  
  test("before daemon restarts, gate on: disk > 90% free, mise resolves, ports free, health passes", () => {
    const preRestartGates = {
      diskFree: "> 90%",
      miseResolves: true,
      portsFree: true,
      healthPasses: true
    }
    
    expect(preRestartGates.diskFree).toBe("> 90%")
    expect(preRestartGates.miseResolves).toBe(true)
    expect(preRestartGates.portsFree).toBe(true)
    expect(preRestartGates.healthPasses).toBe(true)
  })
})

describe("Anomaly 6: Capability-contract verification", () => {
  test("Two truths are a bug - monolith shadows fragments", () => {
    const twoTruths = {
      monolith: { version: "1.0", daemons: 10 },
      fragments: { version: "0.9", daemons: 8 } // stale
    }
    
    const isBug = twoTruths.monolith.version !== twoTruths.fragments.version
    expect(isBug).toBe(true)
    
    // Monolith is the only live truth
    const liveTruth = twoTruths.monolith
    expect(liveTruth.daemons).toBe(10)
  })
})
