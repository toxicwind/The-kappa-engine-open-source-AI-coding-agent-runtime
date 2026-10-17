# Custom Command System

**Priority:** P2

## Remaining Work

- Slash command input handling in chat (detect `/` prefix, show command list)
- Project-level command discovery (scan `.kappacode/commands/` or similar)
- YAML frontmatter metadata support
- Symlink-aware command discovery
- VS Code command palette entry points
- Wire to CLI's custom command system for execution

## Primary Implementation Anchors (kappacode-legacy)

These exist in the [kappacode-legacy](https://github.com/Kappa-Org/kappacode-legacy) repo, not in this extension:

- `src/services/command/`
