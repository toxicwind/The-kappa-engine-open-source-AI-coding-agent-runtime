# Kilocode Rules Migration

This document explains how Kilocode rules are automatically migrated to Opencode's `instructions` config array.

## Overview

Kilocode stores rules in various file locations. When Opencode starts, it reads these files and injects their paths into the `instructions` config array, which Opencode then loads as part of the system prompt.

## Key Guarantees

### 1. Read-Only Migration

The migration **never modifies project files**. We only:

- Read existing rule files from disk
- Inject file paths into the config's `instructions` array
- Never write to the project or modify any files

### 2. Combines with Existing Config (Never Overwrites)

If you have existing opencode config with `instructions`, the Kilocode rules are **combined**, not replaced:

```typescript
// Example: User has opencode.json with:
{ "instructions": ["AGENTS.md", "custom-rules.md"] }

// Kilocode rules add:
{ "instructions": [".kappacoderules", ".kappacode/rules/coding.md"] }

// Result (combined, deduplicated):
{ "instructions": ["AGENTS.md", "custom-rules.md", ".kappacoderules", ".kappacode/rules/coding.md"] }
```

### 3. Restart to Pick Up Changes

If you change your Kilocode configuration (e.g., edit `.kappacoderules`), simply restart kappa-cli to pick up the new config. No manual migration or conversion needed.

## Source Locations

The migrator reads rules from these locations:

### Project Rules

| Location | Description |
|---|---|
| `.kappacoderules` | Legacy single-file rules in project root |
| `.kappacode/rules/*.md` | Directory-based rules (multiple markdown files) |
| `.kappacoderules-{mode}` | Mode-specific legacy rules (e.g., `.kappacoderules-code`) |
| `.kappacode/rules-{mode}/*.md` | Mode-specific rule directories |

### Global Rules

| Location | Description |
|---|---|
| `~/.kappacode/rules/*.md` | Global rules directory |

## File Mapping

| Kilocode Location | Opencode Equivalent |
|---|---|
| `.kappacoderules` | `instructions: [".kappacoderules"]` |
| `.kappacoderules-{mode}` | `instructions: [".kappacoderules-{mode}"]` |
| `.kappacode/rules/*.md` | `instructions: [".kappacode/rules/file.md", ...]` |
| `.kappacode/rules-{mode}/*.md` | `instructions: [".kappacode/rules-{mode}/file.md", ...]` |
| `~/.kappacode/rules/*.md` | `instructions: ["~/.kappacode/rules/file.md", ...]` |

## AGENTS.md Compatibility

`AGENTS.md` is loaded **natively** by Opencode - no migration needed. Opencode automatically loads:

- `AGENTS.md` in project root
- `CLAUDE.md` in project root
- `~/.config/kappa/AGENTS.md` (global)

## Not Migrated

The following are **not** migrated:

- `.roorules` - Roo-specific rules
- `.clinerules` - Cline-specific rules

Only Kilocode-specific files (`.kappacoderules`, `.kappacode/rules/`) are migrated.

## Mode-Specific Rules

Mode-specific rules (e.g., `.kappacoderules-code`, `.kappacode/rules-architect/`) are included by default. All mode-specific rules are loaded regardless of the current mode.

## Warnings

The migrator generates warnings for:

- **Legacy files**: When `.kappacoderules` is found, a warning suggests migrating to `.kappacode/rules/` directory structure

## Example

### Before (Kilocode)

```
project/
├── .kappacoderules           # Legacy rules
├── .kappacoderules-code      # Code-mode specific
└── .kappacode/
    └── rules/
        ├── coding.md        # Coding standards
        └── testing.md       # Testing guidelines
```

### After (Opencode Config)

```json
{
  "instructions": [
    "/path/to/project/.kappacode/rules/coding.md",
    "/path/to/project/.kappacode/rules/testing.md",
    "/path/to/project/.kappacoderules",
    "/path/to/project/.kappacoderules-code"
  ]
}
```

## Troubleshooting

### Rules not appearing

1. Check the file exists at the expected location
2. Ensure markdown files have `.md` extension
3. Restart kappa-cli to pick up changes

### Duplicate rules

The `mergeConfigConcatArrays` function automatically deduplicates the `instructions` array using `Array.from(new Set([...]))`.

## Related Files

- [`rules-migrator.ts`](../rules-migrator.ts) - Core migration logic
- [`config-injector.ts`](../config-injector.ts) - Config building and injection
- [`modes-migration.md`](./modes-migration.md) - Modes migration documentation
