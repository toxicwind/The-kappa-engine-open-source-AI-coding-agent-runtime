// All CommandModules in one place so help.ts and generate-cli-docs.ts can
// introspect them without importing index.ts (which has startup side effects).
// When upstream adds a new command to index.ts, add it here too.
import { AcpCommand } from "../cli/cmd/acp.ts"
import { McpCommand } from "../cli/cmd/mcp.ts"
import { TuiThreadCommand } from "../cli/cmd/tui.ts"
import { AttachCommand } from "../cli/cmd/attach.ts"
import { RunCommand } from "../cli/cmd/run.ts"
import { GenerateCommand } from "../cli/cmd/generate.ts"
import { DebugCommand } from "../cli/cmd/debug/index.ts"
import { ProvidersCommand } from "../cli/cmd/providers.ts"
import { AgentCommand } from "../cli/cmd/agent.ts"
import { UpgradeCommand } from "../cli/cmd/upgrade.ts"
import { UninstallCommand } from "../cli/cmd/uninstall.ts"
import { ServeCommand } from "../cli/cmd/serve.ts"
import { ModelsCommand } from "../cli/cmd/models.ts"
import { StatsCommand } from "../cli/cmd/stats.ts"
import { ExportCommand } from "../cli/cmd/export.ts"
import { ImportCommand } from "../cli/cmd/import.ts"
import { GithubCommand } from "../cli/cmd/github.ts"
import { PrCommand } from "../cli/cmd/pr.ts"
import { SessionCommand } from "../cli/cmd/session.ts"
import { RemoteCommand } from "../cli/cmd/remote.ts"
import { DbCommand } from "../cli/cmd/db.ts"
import { ConfigCommand as ConfigCLICommand } from "../cli/cmd/config.ts"
import { PluginCommand } from "../cli/cmd/plug.ts"
import { DevSetupCommand, DevAliasCommand } from "./cli/dev-setup.ts"
import { RollCallCommand } from "./cli/cmd/roll-call.ts"
import { ProfileCommand } from "./cli/cmd/profile.ts"
import { DaemonCommand } from "./cli/cmd/daemon.ts"
import { KappaConsoleCommand } from "./cli/cmd/console.ts"
import { CloudCommand } from "./cli/cmd/cloud.ts"
import { HelpCommand } from "./help-command.ts"
import { InstallationBuildKind } from "@opencode-ai/core/installation/version"

// Synthetic entry for the yargs built-in .completion() command so that
// generateHelp --all and cli-reference.md include it automatically.
const CompletionCommand = {
  command: "completion",
  describe: "generate shell completion script",
  handler: () => {},
}

// Dev-only commands are spread in conditionally so release builds omit them
// from `kappa help --all` and the docs table. They're also guarded the same way
// at the yargs registration site in src/index.ts, so the commands-in-sync
// regex in test/kappacode/help.test.ts sees DevSetup/DevAlias on neither side.
const dev = InstallationBuildKind === "release" ? [] : [DevSetupCommand, DevAliasCommand]

export const commands = [
  AcpCommand,
  McpCommand,
  TuiThreadCommand,
  AttachCommand,
  RunCommand,
  GenerateCommand,
  DebugCommand,
  ProvidersCommand,
  AgentCommand,
  UpgradeCommand,
  UninstallCommand,
  ServeCommand,
  ModelsCommand,
  RollCallCommand,
  ProfileCommand,
  StatsCommand,
  ExportCommand,
  ImportCommand,
  GithubCommand,
  PrCommand,
  SessionCommand,
  RemoteCommand,
  DaemonCommand,
  KappaConsoleCommand,
  CloudCommand,
  DbCommand,
  ConfigCLICommand,
  ...dev,
  PluginCommand,
  HelpCommand,
  CompletionCommand,
]
