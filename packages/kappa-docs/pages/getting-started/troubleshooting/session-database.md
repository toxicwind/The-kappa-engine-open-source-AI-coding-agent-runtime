---
title: "Session Database"
description: "How kappa stores sessions and how to recover when sessions look lost"
---

# Session Database

Kappa stores sessions and chat history in a local SQLite database. This guide explains where that database lives, why a stray `kappa-.db` can split your history, and how to recover.

## Where the database lives

Sessions live in `~/.local/share/kappa/` as `kappa-<channel>.db`. The `<channel>` is the build channel (git branch by default), sanitized by `safeChannelToken()` so it is always a deterministic, non-empty name.

| Environment | Database path |
|---|---|
| Linux | `~/.local/share/kappa/kappa-<channel>.db` |
| macOS | `~/.local/share/kappa/kappa-<channel>.db` |
| Windows | `%USERPROFILE%\.local\share\kappa\kappa-<channel>.db` |

Run `kappa db path` to print the exact database the current build uses.

## "My sessions disappeared"

The most common cause is a **build channel that sanitizes to an empty name**. A local/dev build made from a detached HEAD or branch-less git context used to resolve the channel to `""`, producing a stray `kappa-.db` instead of `kappa-main.db`. New sessions from that build went into `kappa-.db` while everything else stayed in `kappa-main.db`, so sessions looked "lost".

This is fixed in recent builds: `safeChannelToken()` falls back to a stable `dev` token for empty or meaningless channels, so every build resolves to one predictable database.

## Recovering a split database

If you already have a stray `kappa-.db`, consolidate it back into `kappa-main.db`:

```bash
# Back up both databases first
cp ~/.local/share/kappa/kappa-main.db ~/.local/share/kappa/kappa-main.db.bak
cp ~/.local/share/kappa/kappa-.db ~/.local/share/kappa/kappa-.db.bak

# Merge rows; FK-safe because sessions/messages never share IDs across builds
# (projects are deduped with INSERT OR IGNORE)
sqlite3 ~/.local/share/kappa/kappa-main.db <<'SQL'
ATTACH '/home/toxic/.local/share/kappa/kappa-.db' AS src;
INSERT OR IGNORE INTO project SELECT * FROM src.project;
INSERT OR IGNORE INTO project_directory SELECT * FROM src.project_directory;
INSERT OR IGNORE INTO session SELECT * FROM src.session;
INSERT OR IGNORE INTO event_sequence SELECT * FROM src.event_sequence;
INSERT OR IGNORE INTO event SELECT * FROM src.event;
INSERT OR IGNORE INTO message SELECT * FROM src.message;
INSERT OR IGNORE INTO part SELECT * FROM src.part;
INSERT OR IGNORE INTO kappa_board SELECT * FROM src.kappa_board;
INSERT OR IGNORE INTO kappa_board_message SELECT * FROM src.kappa_board_message;
INSERT OR IGNORE INTO todo SELECT * FROM src.todo;
DETACH src;
SQL
```

Verify the merge and that no foreign keys broke:

```bash
sqlite3 ~/.local/share/kappa/kappa-main.db "SELECT count(*) FROM session;"
sqlite3 ~/.local/share/kappa/kappa-main.db "PRAGMA integrity_check;"
sqlite3 ~/.local/share/kappa/kappa-main.db "PRAGMA foreign_key_check;"
```

The `integrity_check` returns `ok` and `foreign_key_check` returns nothing when healthy.

{% callout type="warning" %}
Run the consolidation only after you have backed up both databases. Adjust the absolute path in the `ATTACH` statement to match your home directory.
{% /callout %}