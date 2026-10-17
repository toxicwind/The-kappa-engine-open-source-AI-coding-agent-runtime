// kappacode_change - new file
import { expect, test } from "bun:test"
import { cliCommand } from "../../src/cli/cmd/pr"

test("cliCommand uses the current script when argv[1] is a file path", () => {
  const result = cliCommand({
    execPath: "/usr/bin/node",
    argv: ["/usr/bin/node", "/tmp/kappa.js", "pr", "1"],
    exists: (file) => file === "/tmp/kappa.js",
  })

  expect(result).toEqual(["/usr/bin/node", "/tmp/kappa.js"])
})

test("cliCommand falls back to execPath when argv[1] is a subcommand", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/kappa",
    argv: ["/usr/local/bin/kappa", "pr", "1"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/kappa"])
})

test("cliCommand ignores subcommand token even when it exists on disk", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/kappa",
    argv: ["/usr/local/bin/kappa", "pr", "1"],
    exists: (file) => file === "pr",
  })

  expect(result).toEqual(["/usr/local/bin/kappa"])
})

test("cliCommand falls back to execPath when argv[1] is missing", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/kappa",
    argv: ["/usr/local/bin/kappa"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/kappa"])
})

test("cliCommand falls back to execPath for bun virtual script paths", () => {
  const unix = cliCommand({
    execPath: "/tmp/kappa",
    argv: ["/tmp/kappa", "/$bunfs/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  const win = cliCommand({
    execPath: "C:/tmp/kappa.exe",
    argv: ["C:/tmp/kappa.exe", "B:/~BUN/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  expect(unix).toEqual(["/tmp/kappa"])
  expect(win).toEqual(["C:/tmp/kappa.exe"])
})
