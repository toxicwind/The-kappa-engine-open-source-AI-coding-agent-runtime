# Dedicated Output Channel

**Priority:** P2

Agent Manager has its own output channel. No general "Kappa Code" output channel exists.

## Remaining Work

- Create `vscode.window.createOutputChannel("Kappa Code")` during activation
- Centralized logging utility with log levels (debug, info, warn, error)
- Route all `[Kappa New]` log messages to this channel
- Dispose on deactivation
- Migrate existing `console.log("[Kappa New] ...")` calls to the logger
