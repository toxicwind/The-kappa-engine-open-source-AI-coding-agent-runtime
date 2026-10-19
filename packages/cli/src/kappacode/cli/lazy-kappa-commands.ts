import { lazy } from "@/kappacode/cli/lazy-commands"

export const KappaConsoleCommand = lazy({
  command: "console",
  describe: "open or stop the local Kappa Console (deprecated)",
  load: async () => (await import("@/kappacode/cli/cmd/console")).KappaConsoleCommand,
})

export const CloudCommand = lazy({
  command: "cloud",
  describe: "run Cloud Agent tasks",
  load: async () => (await import("@/kappacode/cli/cmd/cloud")).CloudCommand,
})

export const RollCallCommand = lazy({
  command: "roll-call <filter>",
  describe: "batch-test text models matching a filter for connectivity and latency",
  load: async () => (await import("@/kappacode/cli/cmd/roll-call")).RollCallCommand,
})

export const ProfileCommand = lazy({
  command: "profile",
  describe: "show Kappa account profile",
  load: async () => (await import("@/kappacode/cli/cmd/profile")).ProfileCommand,
})

export const RemoteCommand = lazy({
  command: "remote",
  describe: "enable remote connection for real-time session relay",
  load: async () => (await import("@/cli/cmd/remote")).RemoteCommand,
})

export const DaemonCommand = lazy({
  command: "daemon",
  describe: "manage the local kappa daemon",
  load: async () => (await import("@/kappacode/cli/cmd/daemon")).DaemonCommand,
})

export const ConfigCLICommand = lazy({
  command: "config",
  describe: "configuration tools",
  load: async () => (await import("@/cli/cmd/config")).ConfigCommand,
})

export const WorktreeCommand = lazy({
  command: "worktree",
  describe: "manage git worktrees",
  load: async () => (await import("@/kappacode/cli/cmd/worktree")).WorktreeCommand,
})

export const PtySmokeCommand = lazy({
  command: "__pty-smoke",
  describe: false,
  load: async () => (await import("@/kappacode/cli/cmd/pty-smoke")).PtySmokeCommand,
})

export const DevSetupCommand = lazy({
  command: "dev-setup",
  describe: "install a `kappadev` shell alias for this checkout",
  load: async () => (await import("@/kappacode/cli/dev-setup")).DevSetupCommand,
})

export const DevAliasCommand = lazy({
  command: "dev-alias [shell]",
  describe: false,
  load: async () => (await import("@/kappacode/cli/dev-setup")).DevAliasCommand,
})
