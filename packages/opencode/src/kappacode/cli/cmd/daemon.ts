import type { Argv } from "yargs"
import type { Daemon } from "@/kappacode/daemon/daemon"
import type { resolveNetworkOptions } from "@/cli/network"
import { cmd } from "@/cli/cmd/cmd"
import { explicitNetworkOptions, withNetworkOptions } from "@/cli/network"

// Keep the top-level import graph light: this module is registered eagerly at CLI
// startup, so implementation dependencies are imported inside handlers (same
// deferral pattern as upstream opencode#30453).
function withJson<T>(yargs: Argv<T>) {
  return yargs.option("json", {
    describe: "print daemon details as JSON",
    type: "boolean",
  })
}

function withForeground<T>(yargs: Argv<T>) {
  return yargs.option("foreground", {
    alias: "f",
    describe: "keep the command active until interrupted",
    type: "boolean",
  })
}

function safe(input: Daemon.State | undefined) {
  if (!input) return undefined
  return {
    pid: input.pid,
    hostname: input.hostname,
    port: input.port,
    url: input.url,
    urls: input.urls,
    username: input.username,
    version: input.version,
    startedAt: input.startedAt,
    log: input.log,
  }
}

function print(input: Daemon.Status, json?: boolean) {
  if (json) {
    console.log(
      JSON.stringify(
        {
          ...input,
          state: safe(input.state),
        },
        null,
        2,
      ),
    )
    return
  }
  if (!input.running) {
    console.log(input.stale ? `kappa daemon stale: ${input.reason}` : `kappa daemon not running`)
    console.log(`state: ${input.file}`)
    if (input.state?.log) console.log(`log: ${input.state.log}`)
    return
  }
  console.log(`kappa daemon running`)
  if (input.state?.urls) {
    const urls = input.state.urls
    console.log(`local:   ${urls.local}`)
    if (urls.network) console.log(`network: ${urls.network}`)
  } else {
    console.log(`url: ${input.state?.url}`)
  }
  console.log(`pid: ${input.state?.pid}`)
  console.log(`version: ${input.health?.version ?? input.state?.version}`)
  console.log(`auth: enabled`)
  console.log(`state: ${input.file}`)
  console.log(`log: ${input.state?.log}`)
}

async function hold(enabled: boolean, json: boolean, run: (signal?: AbortSignal) => Promise<Daemon.State>) {
  if (!enabled) {
    await run()
    return
  }
  const { Daemon } = await import("@/kappacode/daemon/daemon")
  await Daemon.foreground(async (signal) => {
    const state = await run(signal)
    if (!signal.aborted && !json) console.log("Press Ctrl+C to stop the Kappa daemon.")
    return state
  })
}

async function network(args: { [key: string]: unknown }) {
  const { warnedNetworkOptions } = await import("@/kappacode/cli/port-warning")
  return warnedNetworkOptions(args as Parameters<typeof resolveNetworkOptions>[0])
}

function start(command: string) {
  return cmd({
    command,
    describe: "start the local kappa daemon",
    builder: (yargs) => withForeground(withJson(withNetworkOptions(yargs))),
    handler: async (args) => {
      await hold(Boolean(args.foreground), Boolean(args.json), async (signal) => {
        const opts = await network(args)
        const { Daemon } = await import("@/kappacode/daemon/daemon")
        const daemon = await Daemon.ensure(opts, explicitNetworkOptions())
        const result = daemon.result
        const state = result.state
        if (!state) throw new Error("Kappa daemon did not provide process state")
        if (signal?.aborted) return state
        if (args.json) print(result, true)
        if (!args.json) {
          console.log(
            result.reused
              ? "kappa daemon already running"
              : daemon.restarted
                ? "kappa daemon restarted"
                : "kappa daemon started",
          )
          print(result)
        }
        return state
      })
    },
  })
}

const DefaultCommand = start("$0")
const StartCommand = start("start")

const StatusCommand = cmd({
  command: "status",
  describe: "show local kappa daemon status",
  builder: (yargs) => withJson(yargs),
  handler: async (args) => {
    const { Daemon } = await import("@/kappacode/daemon/daemon")
    print(await Daemon.status(), Boolean(args.json))
  },
})

export const StopCommand = cmd({
  command: "stop",
  describe: "stop the local kappa daemon",
  builder: (yargs) => withJson(yargs),
  handler: async (args) => {
    const { Daemon } = await import("@/kappacode/daemon/daemon")
    const result = await Daemon.stop()
    if (args.json) {
      print(result, true)
      return
    }
    console.log(result.stopped ? "kappa daemon stopped" : "kappa daemon not running")
  },
})

const RestartCommand = cmd({
  command: "restart",
  describe: "restart the local kappa daemon",
  builder: (yargs) => withForeground(withJson(withNetworkOptions(yargs))),
  handler: async (args) => {
    await hold(Boolean(args.foreground), Boolean(args.json), async (signal) => {
      const opts = await network(args)
      const { Daemon } = await import("@/kappacode/daemon/daemon")
      const result = await Daemon.restart(opts)
      const state = result.state
      if (!state) throw new Error("Kappa daemon did not provide process state")
      if (signal?.aborted) return state
      if (args.json) print(result, true)
      if (!args.json) {
        console.log("kappa daemon restarted")
        print(result)
      }
      return state
    })
  },
})

export const DaemonCommand = cmd({
  command: "daemon",
  describe: "manage the local kappa daemon",
  builder: (yargs: Argv) =>
    yargs
      .command(DefaultCommand)
      .command(StartCommand)
      .command(StatusCommand)
      .command(StopCommand)
      .command(RestartCommand)
      .demandCommand(),
  handler: async () => {},
})
