# Kappa-Code Memory Integration — Design Report (Phase 1: PoC)

## 1. Current-State Audit

Memory in kappa-code exists in **three separate places**, all delivering functionality externally:

| Location | What It Does | Problem |
|----------|-------------|---------|
| `packages/kappa-memory/src/` | Full memory package: JSONL file storage, recall search, capture/consolidation pipeline, Effect service (`MemoryService`), tool wrappers (`recall.ts`, `save.ts`), turn lifecycle hooks (`turn.ts`, `MemoryLifecycle`). | **Separate package** — delivered as an add-on, not core. Has its own `effect/service.ts`, `memory.ts`, `recall/`, `storage/`, `capture/`. |
| `packages/cli/src/kappacode/tool/memory-recall.ts` + `memory-save.ts` | Tool wrappers that call into `@kappacode/kappa-memory/effect/service` and `@kappacode/kappa-memory/tool`. | Thin wrappers around the separate package — no logic of their own. |
| `packages/cli/src/tool/recall.ts` (`kappa_local_recall`) | SQLite session recall (gamma) — searches session transcript JSONL files. | Different storage backend (SQLite), different use case (session recall vs memory), but coexists alongside kappa-memory. |
| `~/.config/kappa/skills/kappa-hindsight/` | Standalone CLI script reading `~/.local/share/kappa/kappa-main.db` via `node:sqlite`. | **Another separate delivery** — reads the same SQLite DB but as a skill/script, not integrated. |

The architect's complaint: **skills build as delivery is a copout** — memory was supposed to be built INTO kappa-code as a core capability, analogous to how tau's hindsight is deeply integrated into the coding-agent runtime.

---

## 2. Architecture Design

### 2.1 Where the Service Lives

**New module: `packages/core/src/memory/index.ts`**

Mirrors `packages/core/src/background-job.ts` structure exactly:
- `export class Service extends Context.Service<Service, Interface>()("@kappacode/Memory")`
- `function make()` → `Service.of({...})`
- `const layer = Layer.effect(Service, Effect.sync(make))`
- `export const node = makeGlobalNode({ service: Service, layer, deps: [] })`

The service is a **global node** (like BackgroundJob), not location-scoped. Memory is shared across all locations within a session.

### 2.2 Service Interface

```typescript
export interface Interface {
  retain: (input: { text: string; key?: string; source?: "user"|"auto"|"tool"; tags?: string[] })
    => Effect.Effect<MemoryEntry>
  recall: (input: { query: string; limit?: number }) => Effect.Effect<RecallResult>
  reflect: (input: { query?: string }) => Effect.Effect<ReflectResult>
  clear: () => Effect.Effect<void>
  listKeys: () => Effect.Effect<string[]>
  count: () => Effect.Effect<number>
}
```

**ret**ain = write (idempotent by key, with dedup)
**Rec**all = search (scored relevance, limit)
**Ref**lect = analyze (summary, patterns, suggestions) — stubbed in PoC

### 2.3 Storage Choice

**JSONL files on disk** (`~/.local/share/kappa/memory/kappa-memory.jsonl`).

Justification:
- Same persistence model as the existing `kappa-memory` package's source files (project.md, corrections.md, etc.)
- No new database infrastructure required — survives restarts, portable
- In-memory Map + key index for O(1) dedup and fast recall
- The existing kappa-memory package's storage layer (JSONL-based `.md` files per source type) is more complex than needed for the core recall/retain/reflect primitive. The JSONL approach is simpler and equally durable.
- When the full kappa-memory pipeline (capture, consolidation, typed memory) is folded in later, it can layer on top of this storage.

### 2.4 Canonical Tool Registration

**Three new tools in `packages/core/src/tool/`:**

| Tool | File | Tool Name | Source Node |
|------|------|-----------|-------------|
| `memory_recall` | `memory-recall.ts` | `memory_recall` | `MemoryRecallTool.node` |
| `memory_save` | `memory-save.ts` | `memory_save` | `MemorySaveTool.node` |
| `memory_reflect` | `memory-reflect.ts` | `memory_reflect` | `MemoryReflectTool.node` |

Each follows the `background-job.ts` pattern:
- `Tool.make({...})` with `description`, `input` (Schema), `output` (Schema), `toModelOutput`, `execute`
- Layer uses `Layer.effectDiscard(Effect.gen(function* () { ... yield* tools.register(...) }))`
- `makeLocationNode({ name, layer, deps: [ToolRegistry.node, Memory.node] })`

**Registered in `packages/core/src/tool/builtins.ts` deps array:**
```typescript
deps: [
  // ... existing ...
  MemoryRecallTool.node,
  MemorySaveTool.node,
  MemoryReflectTool.node,
  // ... existing ...
]
```

This makes memory a **first-class built-in capability** alongside bash, edit, read, grep, glob, write — not a separately-delivered package.

### 2.5 Lifecycle Hooks (Comparison to Tau's Hindsight)

Tau's hindsight integration:

| Tau Hindsight Hook | Kappa-Code Analog | Status |
|---|---|---|
| `beforeAgentStartPrompt()` — auto-recall on first turn | Hook into `KappaSession.Event.TurnOpen` bus event (already exists in `kappacode/memory/turn.ts`) | **Already wired** — the existing `MemoryLifecycle.subscribe` in `kappacode/memory/turn.ts` subscribes to `TurnOpen` and `TurnClose`. The PoC can extend this. |
| `maybeRetainOnAgentEnd()` — auto-retain when agent ends | Hook into `KappaSession.Event.TurnClose` (already wired in existing `MemoryLifecycle`) | **Already wired** |
| `HindsightRetainQueue` — debounced batch retain | The PoC service's `persist()` is synchronous (fire-and-forget). A debounced batch queue is Phase 2. | **Phase 2** |
| Mental models (seeded, cached, injected into system prompt) | Phase 3 — the `reflect` tool generates suggestions; mental models are a future enhancement | **Phase 3** |

The **existing `MemoryLifecycle.subscribe`** in `packages/cli/src/kappacode/memory/turn.ts` already subscribes to session turn lifecycle events. The built-in service integrates naturally here — the `MemoryTurn.close` hook becomes the retention trigger.

### 2.6 Retirement/Port Plan for `packages/kappa-memory`

1. **Phase 1 (this PoC):** Coexist. New tools `memory_recall`, `memory_save`, `memory_reflect` are registered in builtins. Existing `kappa_memory_recall` and `kappa_memory_save` (the wrapper tools in `kappacode/tool/`) continue to work via the separate `kappa-memory` package.

2. **Phase 2:** Re-point the existing `kappacode/tool/memory-recall.ts` and `kappacode/tool/memory-save.ts` wrappers to use the new built-in `Memory.Service` instead of `@kappacode/kappa-memory/effect/service`. This can be done with `kilocode_change` markers since the wrapper files are kappa-owned.

3. **Phase 3:** Once all callers are re-pointed, deprecate and mark `packages/kappa-memory` for retirement. The storage format (JSONL) is compatible — entries written by the old package can be read by the new service and vice versa.

---

## 3. PoC Code Changes

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/memory/index.ts` | Built-in memory service: Interface, Service class, JSONL-backed implementation, global node export |
| `packages/core/src/tool/memory-recall.ts` | Canonical `memory_recall` tool (search) |
| `packages/core/src/tool/memory-save.ts` | Canonical `memory_save` tool (write/retain) |
| `packages/core/src/tool/memory-reflect.ts` | Canonical `memory_reflect` tool (analyze — stubbed) |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/tool/builtins.ts` | Added imports for `MemoryRecallTool`, `MemorySaveTool`, `MemoryReflectTool`; added their `.node` to deps array |

### How It Proves the Integration Pattern

1. **Service in core:** `packages/core/src/memory/index.ts` follows the exact same structure as `packages/core/src/background-job.ts` — `Context.Service` class, `make()` function, `Layer.effect`, `makeGlobalNode`. This proves the service pattern works.

2. **Canonical built-in tools:** The three tool files follow the exact same structure as `packages/core/src/tool/background-job.ts` — `Tool.make`, `Layer.effectDiscard`, `makeLocationNode` with `ToolRegistry.node` + `Memory.node` deps.

3. **Registered in builtins.ts:** The memory tools appear in the `deps` array of `builtins.ts`, the canonical list of Location-scoped built-in tools. This proves they are wired into the agent's tool surface automatically, just like `background_job`, `edit`, `read`, etc.

4. **No separate package:** The memory code lives in `packages/core/src/` — same package as `background-job`, `edit`, `read`. No `packages/kappa-memory` dependency required for the core service.

---

## 4. Verification Evidence

### Typecheck (tsgo --noEmit)
- Command: `cd packages/core && npx tsgo --noEmit`
- Result: **Exit code 0 — zero errors**
- Full output saved to: `packages/core/core-tsc-result.txt`

### Tests
- Command: `cd packages/core && bun test test/effect/layer-node/`
- Result: **18 pass, 0 fail, 24 expect() calls** (437ms)
- Full output saved to: `packages/core/test-layer-node-result.txt`

---

## 5. What's Left (Deliberate Gaps)

1. **Session-scoped state:** The PoC service is process-global. Tau's `HindsightSessionState` creates per-session state. Phase 2 should add a `HindsightSessionState`-equivalent with session-scoped `retainQueue`, `hasRecalledForFirstTurn`, etc.

2. **Auto-recall on first turn:** Tau injects recalled memory into the developer prompt before the first turn. The PoC's `memory_recall` tool is manual-only. Phase 2 should hook `beforeAgentStartPrompt` equivalent to auto-recall and inject results into context.

3. **Auto-retain on agent-end:** Tau's `maybeRetainOnAgentEnd()` formats and retains the transcript slice. The PoC has no auto-retain. Phase 2 should hook `TurnClose` to capture transcript context and retain it.

4. **Debounced retain queue:** Tau uses `HindsightRetainQueue` (batch flush, size-bounded, timer-based). Phase 2 should add this.

5. **Mental models:** Tau's seeded mental models, cached snippet injection, and refresh are a full subsystem. Phase 3.

6. **Retirement of kappa-memory:** The PoC coexists. Phase 2 re-points the existing wrappers. Phase 3 retires the package.

7. **SQLite backend option:** The design notes mention that SQLite via `effect-sqlite` could be the storage backend instead of JSONL. The JSONL approach was chosen for PoC speed; SQLite is justified for larger-scale memory but adds complexity.

---

## 6. How This Addresses the Architect's Complaint

"Skills build as delivery is a copout" meant memory was being delivered as an **externally-provided package** (`packages/kappa-memory`) with tool wrappers that call into it — a separate delivery mechanism rather than a core capability. This design makes memory **native to kappa-code's runtime**: the service lives in `packages/core/src/memory/` alongside `background-job.ts`, is registered as a global Effect node, and is exposed through canonical built-in tools (`memory_recall`, `memory_save`, `memory_reflect`) in `builtins.ts` — the same mechanism that wires bash, edit, read, and grep. Memory is no longer something the agent "fetches" or "installs"; it's a first-class part of the agent's dependency graph, wired into the session lifecycle, and delivered as a core capability.
