// kilocode_change - new file
/**
 * Internal URL routing system for internal protocols (`agent://`,
 * `artifact://`, `history://`, `issue://`, `local://`, `mcp://`, `memory://`,
 * `tau://`, `pr://`, `proc://`, `rule://`, `security://`, `skill://`, `ssh://`,
 * `vault://`, and `xd://`).
 *
 * One process-global `InternalUrlRouter` is shared across sessions. Handlers
 * are stateless; they pull whatever they need (active skills/rules, active
 * MCP/async managers, AgentRegistry-listed sessions) from the owning module
 * on each resolve call.
 */

export * from "./agent-protocol"
export * from "./artifact-protocol"
export * from "./history-protocol"
export * from "./issue-pr-protocol"
export * from "./local-protocol"
export * from "./mcp-protocol"
export * from "./memory-protocol"
export * from "./tau-protocol"
export * from "./parse"
export * from "./router"
export * from "./rule-protocol"
export * from "./security-protocol"
export * from "./skill-protocol"
export * from "./ssh-protocol"
export type * from "./types"
export * from "./vault-protocol"
export * from "./xd-protocol"