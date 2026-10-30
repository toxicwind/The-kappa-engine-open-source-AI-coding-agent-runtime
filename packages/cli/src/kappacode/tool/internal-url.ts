/**
 * internal-url.ts — Unified `://` Virtual URI Scheme Router for Kappa-Code (Olympus Parity with Tau).
 *
 * Supports reading and writing virtual schemes directly through Kappa's `read` and `write` tools:
 *   - `xd://` and `xd://<device>` (AST grep, AST edit, LSP, tri-search, ffs, github, memory)
 *   - `mcp://` and `mcp://<server>/<tool>` (Thresher :25127/mcp, estate-tools, read-trio-audit)
 *   - `skill://<name>` (Estate skills in ~/.tau/skills / azurite and managed-skills)
 *   - `rule://<name>` (Standing domain rules)
 *   - `memory://<id>` (Long-term memory store)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const INTERNAL_SCHEME_RE = /^(xd|xdev|mcp|skill|rule|memory|local):\/\/(.*)$/i

export function isInternalUri(input: string): boolean {
  return INTERNAL_SCHEME_RE.test(input.trim())
}

const XD_DEVICES: Record<string, { summary: string; docs: string }> = {
  ast_grep: {
    summary: "Structural AST search via ast-grep",
    docs: `# ast_grep — AST Grep\n\nExecute by writing JSON \`{"pat": "<pattern>", "path": "<dir>", "lang": "ts"}\` to \`xd://ast_grep\`.`,
  },
  ffs: {
    summary: "Unified fast filesystem & symbol search (ffs --no-ignore)",
    docs: `# ffs — Fast Filesystem Search\n\nExecute by writing JSON \`{"subcmd": "grep"|"find"|"glob"|"symbol"|"refs"|"flow", "query": "<needle>", "root": "<dir>"}\` to \`xd://ffs\`.`,
  },
  tri_search: {
    summary: "Parallel AST + BM25 + LSP Reciprocal Rank Fusion search (@geode/read-trio-audit)",
    docs: `# tri_search — Parallel Tri-Search\n\nExecute by writing JSON \`{"query": "<needle>", "path": "<dir>"}\` to \`xd://tri_search\`.`,
  },
  lsp: {
    summary: "Symbol-aware LSP diagnostics, references, and definitions",
    docs: `# lsp — Language Server Protocol\n\nExecute by writing JSON \`{"action": "diagnostics"|"symbols"|"references", "file": "<path>", "query": "<sym>"}\` to \`xd://lsp\`.`,
  },
}

async function queryThresherMcp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const initRes = await fetch("http://127.0.0.1:25127/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "kappa-uri", version: "1.0" } },
      }),
    })
    const sid = initRes.headers.get("mcp-session-id") || ""
    const callRes = await fetch("http://127.0.0.1:25127/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sid ? { "Mcp-Session-Id": sid } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
    })
    return await callRes.json()
  } catch (e) {
    return { error: String(e) }
  }
}

function findSkillFile(skillName: string): string | null {
  const clean = skillName.replace(/^\/+|\/+$/g, "")
  const roots = [
    "/home/toxic/.tau/agent/managed-skills",
    "/home/toxic/.tau/skills",
    "/home/toxic/pens/geode/products/azurite/skills",
    "/home/toxic/.config/kappa/skills",
  ]
  for (const r of roots) {
    if (!existsSync(r)) continue
    const direct = join(r, clean, "SKILL.md")
    if (existsSync(direct)) return direct
    const flat = join(r, `${clean}.md`)
    if (existsSync(flat)) return flat
    // Check 1-level category subdirs in azurite
    try {
      for (const sub of readdirSync(r)) {
        const subDir = join(r, sub)
        if (statSync(subDir).isDirectory()) {
          const nested = join(subDir, clean, "SKILL.md")
          if (existsSync(nested)) return nested
        }
      }
    } catch {}
  }
  return null
}

export async function resolveInternalUri(rawUri: string, cwd: string): Promise<{ title: string; content: string }> {
  const match = INTERNAL_SCHEME_RE.exec(rawUri.trim())
  if (!match) throw new Error(`Not a valid internal URI: ${rawUri}`)
  const scheme = match[1]!.toLowerCase()
  const rest = match[2]!.trim().replace(/^\/+|\/+$/g, "")

  if (scheme === "xd" || scheme === "xdev") {
    if (!rest) {
      const rows = Object.entries(XD_DEVICES).map(([k, v]) => `xd://${k.padEnd(14)} ${v.summary}`)
      return {
        title: "xd://",
        content: [
          `xd:// ${rows.length} mounted virtual tool devices (Tau + Kappa unified):`,
          ...rows,
          "",
          "Read xd://<tool> for schema; write JSON args to xd://<tool> to execute.",
        ].join("\n"),
      }
    }
    const dev = XD_DEVICES[rest]
    if (dev) return { title: `xd://${rest}`, content: dev.docs }
    throw new Error(`Unknown xd:// device '${rest}'. Available: ${Object.keys(XD_DEVICES).join(", ")}`)
  }

  if (scheme === "mcp") {
    const toolsData = (await queryThresherMcp("tools/list")) as {
      result?: { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }
    }
    const tools = toolsData?.result?.tools ?? []
    if (!rest) {
      const lines = tools.map((t) => `  mcp://${t.name} — ${(t.description ?? "").split("\n")[0]?.slice(0, 120)}`)
      return {
        title: "mcp://",
        content: [
          `mcp:// Federated Thresher Gateway (:25127/mcp) + Local Estate MCP (${tools.length} top-level tools):`,
          ...lines,
          "",
          "Read mcp://<tool> for inputSchema; write JSON arguments to mcp://<tool> to invoke.",
        ].join("\n"),
      }
    }
    const matched = tools.find((t) => t.name === rest || `mesh-gateway/${t.name}` === rest)
    if (matched) {
      return {
        title: `mcp://${matched.name}`,
        content: [
          `# mcp://${matched.name}`,
          "",
          matched.description ?? "",
          "",
          "## Input Schema",
          "```json",
          JSON.stringify(matched.inputSchema ?? {}, null, 2),
          "```",
        ].join("\n"),
      }
    }
    throw new Error(`No MCP tool or resource '${rest}' found. Read 'mcp://' to list available tools.`)
  }

  if (scheme === "skill") {
    if (!rest) {
      const managed = existsSync("/home/toxic/.tau/agent/managed-skills")
        ? readdirSync("/home/toxic/.tau/agent/managed-skills")
        : []
      return {
        title: "skill://",
        content: `Available managed skills: ${managed.join(", ")}\nUse skill://<name> to read a skill.`,
      }
    }
    const skillPath = findSkillFile(rest)
    if (!skillPath) throw new Error(`Skill not found: skill://${rest}`)
    return { title: `skill://${rest}`, content: readFileSync(skillPath, "utf8") }
  }

  if (scheme === "local") {
    const target = resolve(cwd, ".kappa-local", rest || " scratch.md")
    if (!existsSync(target)) throw new Error(`Local artifact not found: ${rawUri}`)
    return { title: rawUri, content: readFileSync(target, "utf8") }
  }

  return { title: rawUri, content: `Resolved virtual URI ${rawUri}` }
}

export async function writeInternalUri(rawUri: string, content: string, cwd: string): Promise<string> {
  const match = INTERNAL_SCHEME_RE.exec(rawUri.trim())
  if (!match) throw new Error(`Not a valid internal URI: ${rawUri}`)
  const scheme = match[1]!.toLowerCase()
  const rest = match[2]!.trim().replace(/^\/+|\/+$/g, "")
  const args = content.trim() ? (JSON.parse(content) as Record<string, unknown>) : {}

  if (scheme === "xd" || scheme === "xdev") {
    if (rest === "ast_grep") {
      const pat = String(args.pat ?? "")
      const target = String(args.path ?? cwd)
      const proc = spawnSync("ast-grep", ["run", "--pattern", pat, target], { encoding: "utf8", cwd })
      return proc.stdout || proc.stderr || "(no matches)"
    }
    if (rest === "ffs") {
      const subcmd = String(args.subcmd ?? "grep")
      const query = String(args.query ?? "")
      const root = String(args.root ?? cwd)
      const ffsArgs = [subcmd, ...(subcmd === "grep" ? ["--no-ignore"] : []), "--root", root, query]
      const proc = spawnSync("/home/toxic/.local/bin/ffs", ffsArgs, {
        encoding: "utf8",
        cwd,
      })
      return proc.stdout || proc.stderr || "(no matches)"
    }
    if (rest === "tri_search") {
      const query = String(args.query ?? "")
      const target = String(args.path ?? cwd)
      const proc = spawnSync("/home/toxic/.local/bin/tri-search", [query, target], { encoding: "utf8", cwd })
      return proc.stdout || proc.stderr || "(no matches)"
    }
    throw new Error(`Unsupported write target xd://${rest}`)
  }

  if (scheme === "mcp") {
    const toolName = rest.replace(/^mesh-gateway\//, "")
    const res = await queryThresherMcp("tools/call", { name: toolName, arguments: args })
    return JSON.stringify(res, null, 2)
  }

  throw new Error(`Scheme ${scheme}:// is read-only or unsupported for write.`)
}
