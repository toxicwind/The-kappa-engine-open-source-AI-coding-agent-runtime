import { describe, expect, test } from "bun:test"
import { KappaPtySelfCommand } from "../../src/kappacode/pty/self-command.ts"

describe("pty self-command", () => {
  test("does not forward bundled bun entrypoints", () => {
    const proc = {
      argv: ["/tmp/kappa", "/$bunfs/root/src/index.js"],
      execArgv: ["--user-agent=kappa/test", "--use-system-ca", "--"],
      execPath: "/tmp/kappa",
      cwd: "/tmp",
    }

    const cmd = KappaPtySelfCommand.command(proc)
    expect(cmd).toStrictEqual({ command: "/tmp/kappa", args: [] })
    expect(KappaPtySelfCommand.resolve({ command: "kappa", cwd: "/tmp/project" }, cmd)).toStrictEqual({
      command: "/tmp/kappa",
      args: [],
      cwd: "/tmp/project",
    })
    expect(
      KappaPtySelfCommand.command({
        ...proc,
        argv: ["C:/tmp/kappa.exe", "B:/~BUN/root/src/index.js"],
      }).args,
    ).toStrictEqual([])
    expect(
      KappaPtySelfCommand.command({
        ...proc,
        argv: ["C:/tmp/kappa.exe", "b:\\~BUN\\root\\src\\index.js"],
      }).args,
    ).toStrictEqual([])
  })

  test("forwards source entrypoints", () => {
    const cmd = KappaPtySelfCommand.command({
      argv: ["/tmp/bun", "/tmp/kappa/src/index.ts"],
      execArgv: ["--conditions=browser", "--cwd", "packages/opencode"],
      execPath: "/tmp/bun",
      cwd: "/tmp/kappa",
    })
    expect(cmd).toStrictEqual({
      command: "/tmp/bun",
      args: ["--conditions=browser", "/tmp/kappa/src/index.ts"],
      cwd: "/tmp/kappa",
    })
    expect(KappaPtySelfCommand.resolve({ command: "kappa", cwd: "/tmp/project" }, cmd)).toStrictEqual({
      command: "/tmp/bun",
      args: ["--conditions=browser", "/tmp/kappa/src/index.ts", "/tmp/project"],
      cwd: "/tmp/kappa",
    })
  })
})
