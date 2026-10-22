---
title: "Troubleshooting IDE Extensions"
description: "How to capture console logs and report issues with Kappa Code"
---

# Capturing Console Logs

Providing console logs helps us pinpoint exactly what's going wrong with your installation, network, or MCP setup. This guide walks you through capturing those logs in your IDE.

## Opening Developer Tools

1. **Open the Command Palette**: Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. **Search for Developer Tools**: Type `Developer: Open Webview Developer Tools` and select it

## Capturing the Error

Once you have the Developer Tools console open:

1. **Clear previous logs**: Click the "Clear Console" button (🚫 icon at the top of the Console panel) to remove old messages
2. **Reproduce the issue**: Perform the action that was causing problems
3. **Check for errors**: Look at the Console tab for error messages (usually shown in red). If you suspect connection issues, also check the **Network** tab
4. **Copy the logs**: Right-click in the console and select "Save as..." or copy the relevant error messages

## SQLite database is malformed

If every prompt fails with `SQLiteError: database disk image is malformed`, Kappa Code's local SQLite database may be corrupted. This database stores local Kappa state such as sessions and history.

### Find the database

When the kappa CLI uses the same environment as the affected installation, run `kappa db path` to print the selected database. See [Session database](/docs/getting-started/troubleshooting/session-database) for the database location and how to recover a split `kappa-.db`.

The default database location depends on where Kappa Code is running:

| Environment | Database path |
|---|---|
| Windows | `%USERPROFILE%\.local\share\kappa\kappa-<channel>.db` |
| macOS | `~/.local/share/kappa/kappa-<channel>.db` |
| Linux | `~/.local/share/kappa/kappa-<channel>.db` |
| VS Code Remote SSH | `~/.local/share/kappa/kappa-<channel>.db` on the remote machine |

{% callout type="warning" %}
When using VS Code Remote SSH, check the remote Linux machine, not your local Windows or macOS computer.
{% /callout %}

### Reset the database

Close VS Code or stop the Kappa backend first. On Linux or Remote SSH, resolve the active database with `kappa db path`, then rename it aside:

```bash
pkill -f "kappa serve"
mkdir -p ~/.local/share/kappa
dbfile="$(kappa db path)"
mv "$dbfile" "$dbfile.bak"
mv "$dbfile-wal" "$dbfile-wal.bak" 2>/dev/null
mv "$dbfile-shm" "$dbfile-shm.bak" 2>/dev/null
```

Then reload VS Code or reconnect Remote SSH. Kappa Code recreates the database the next time it starts.

On Windows or macOS, rename the database file produced by `kappa db path` and its `-wal` or `-shm` siblings in the same folder, then restart the IDE.

{% callout type="warning" %}
Renaming this database resets local Kappa Code sessions and history for that machine. Keep the `.bak` files if you need to share them with support or attempt recovery later.
{% /callout %}

### Fully reset local Kappa data

If resetting the database does not fix the issue, you can fully reset Kappa Code's local data. This also removes local configuration and cache files, so use it only after trying the database reset above.

On Linux or VS Code Remote SSH, run this on the machine where Kappa Code is running:

```bash
pkill -f "kappa serve"
mv ~/.local/share/kappa ~/.local/share/kappa.bak 2>/dev/null
mv ~/.config/kappa ~/.config/kappa.bak 2>/dev/null
mv ~/.cache/kappa ~/.cache/kappa.bak 2>/dev/null
```

Then reload VS Code or reconnect Remote SSH. Kappa Code recreates these directories the next time it starts.

{% callout type="warning" %}
This resets local sessions, history, settings, and cached data. Prefer renaming the directories instead of deleting them so you can recover files. Remove secrets such as API keys or tokens before sharing any backup with support.
{% /callout %}

## Diagnosing WSL disconnects

If you use Kappa Code with VS Code on WSL and the extension repeatedly disconnects — VS Code shows "reconnecting" or the Kappa backend stops responding — capture a diagnostic bundle **before** restarting WSL or rebooting. A restart wipes most of the evidence.

1. Open any WSL terminal. An already-open Windows Terminal tab with your distribution works fine, even while VS Code is still reconnecting.

2. Paste this single command:

   ```bash
   OUT=/tmp/kappa-diag-$(date +%Y%m%dT%H%M%S) && mkdir -p $OUT && { echo "--- date"; date; echo "--- uptime"; uptime; echo "--- free"; free -h; echo "--- oom/kills"; sudo dmesg -T | grep -iE "oom|out of memory|killed process" | tail -60; } > $OUT/system.txt 2>&1; cp -r ~/.vscode-server/data/logs $OUT/vscode-logs 2>/dev/null; cp -r ~/.vscode-server-insiders/data/logs $OUT/vscode-insiders-logs 2>/dev/null; cp -r ~/.local/share/kappa/log $OUT/kappa-logs 2>/dev/null; tar czf /mnt/c/Users/Public/kappa-diag.tgz -C /tmp $(basename $OUT) && echo "Done -> C:\\Users\\Public\\kappa-diag.tgz"
   ```

   It may ask for your sudo password. The command collects kernel out-of-memory events, WSL VM uptime (which shows whether the whole VM restarted or just the VS Code server died), current memory stats, the VS Code remote server logs, and Kappa logs — nothing else.

   {% callout type="warning" %}
   Inspect the bundle before sharing it and remove any secrets such as API keys, tokens, prompts, or file paths. The bundle is written to `C:\Users\Public`, a folder shared with Windows so you can access it outside WSL — delete it once you're done sharing it.
   {% /callout %}

3. When it prints `Done`, send us the file `C:\Users\Public\kappa-diag.tgz` from Windows.

4. Include roughly how many Agent Manager sessions or worktrees were running in parallel when the disconnect happened.

## Contact Support

If you're unable to resolve the issue, please inspect the console logs, remove any secrets, and send the logs to **[hi@kappacode.ai](mailto:hi@kappacode.ai)** along with the following:

- The error messages from the console
- Steps to reproduce the issue
- Screenshots or screen recordings of the issue
- Your IDE and Kappa Code version
