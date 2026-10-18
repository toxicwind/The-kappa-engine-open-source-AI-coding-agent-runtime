// Test: 3 alternative KAPPA CLI logo variants for evaluation
// Run: bun test/test/kappacode/cli/logo-variants.test.ts

import { LOGO_MODERN, LOGO_PLAIN, LOGO_FALLBACK } from "../../../src/kappacode/cli/logo.ts"

import { describe, expect, test } from "bun:test"

describe("KAPPA CLI logo variants", () => {
  test("Option A: double-line KAPPA", () => {
    const LOGO_A = [
      "╔═══╗  ╔═══╗  ╔═╗╔═╗  ╔════╗  ╔════╗   ╔═══╗  ",
      "╠═██║  ║╠═╗║  ║║║║║  ║═╗ ║  ║═╗ ║   ║═╗ ║  ",
      "║ ║║  ║║ ║║  ║║║║║  ║ ║║ ║  ║ ║║    ║║ ║   ",
      "║ ║║  ║║ ║║  ║║║║║  ║  ║ ║  ║  ║║    ║║ ║   ",
      "║ ║║  ║║ ║║  ║║║║║  ║   ║║  ║   ║║    ║║ ║   ",
      "╚═══╝  ╚═══╝  ╚╝╚╝  ╚═══╝  ╚═══╝   ╚═══╝  ",
    ].join("\n")
    console.log(LOGO_A)
    expect(LOGO_A.length).toBeGreaterThan(0)
  })

  test("Option B: slash-cut KAPPA", () => {
    const LOGO_B = [
      " ▗▞▀▚▖  ▗▞▀▚▖  ▗▄▄▄   ▗▄▄▄▄▖  ▗▄▄▄▄   ▗▄▄▄   ",
      "▐▌  ▐▌ ▐▌ ▐▌ ▐▌   ▐▌ ▐▌   ▐▌ ▐▌   ▐▌   ▐▌   ",
      "▐▌  ▐▌ ▐▌  ▐▌ ▐████   ▐███▌  ▐████   ▐████   ",
      "▐▌  ▐▌ ▐▌  ▐▌ ▐▌   ▐▌   ▐▌ ▐▌      ▐▌   ▐▌   ",
      "▐▌  ▐▌ ▐▌  ▐▌ ▐▌   ▐▌   ▐▌ ▐▌      ▐▌   ▐▌   ",
      " ▝▀▚▀▘  ▝▀▚▀▘  ▝▀▀▀   ▝▀▀▀▀   ▝▀▀▀    ▝▀▀▀    ",
    ].join("\n")
    console.log(LOGO_B)
    expect(LOGO_B.length).toBeGreaterThan(0)
  })

  test("Option C: pixel-block KAPPA", () => {
    const LOGO_C = [
      "▓▓  ▓▓  ▓▓▓▓▓  ▓▓▓▓▓▓  ▓▓▓▓▓▓   ▓▓▓▓▓  ",
      "▓▓▓▓  ▓▓  ▓▓   ▓▓  ▓▓   ▓▓  ▓▓   ▓▓   ▓▓ ",
      "▓▓▓▓▓   ▓▓▓▓▓▓▓  ▓▓▓▓▓▓  ▓▓▓▓▓▓   ▓▓▓▓▓▓ ",
      "▓▓  ▓▓  ▓▓   ▓▓  ▓▓       ▓▓       ▓▓   ▓▓ ",
      "▓▓   ▓▓  ▓▓   ▓▓  ▓▓       ▓▓       ▓▓   ▓▓ ",
      "▓▓    ▓▓  ▓▓   ▓▓  ▓▓       ▓▓       ▓▓   ▓▓ ",
    ].join("\n")
    console.log(LOGO_C)
    expect(LOGO_C.length).toBeGreaterThan(0)
  })

  test("all committed logos render as multi-line art", () => {
    const logos = [LOGO_MODERN, LOGO_PLAIN, LOGO_FALLBACK]
    for (const logo of logos) {
      const lines = logo
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0)
      }
    }
  })
})
