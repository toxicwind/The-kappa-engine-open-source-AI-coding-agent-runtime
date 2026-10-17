import { describe, expect, test } from "bun:test"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { EventManifest as SchemaEventManifest } from "@opencode-ai/schema/event-manifest"
import { Todo } from "@/session/todo"
import { EventManifest } from "@/event-manifest"
import { Drained, Interrupted } from "@opencode-ai/schema/kappacode/session-drain" // kappacode_change
import { Pending as WakeupPending } from "@opencode-ai/schema/kappacode/wakeup-event" // kappacode_change
import { AuthUrl } from "@opencode-ai/schema/mcp-event" // kappacode_change

describe("public event manifest", () => {
  test("contains every latest public wire type once", () => {
    expect(EventManifest.Definitions).toBe(SchemaEventManifest.Definitions)
    expect(EventManifest.Latest).toBe(SchemaEventManifest.Latest)
    expect(EventManifest.Durable).toBe(SchemaEventManifest.Durable)
    expect(EventManifest.Latest.size).toBe(94) // kappacode_change - include session drain, wakeup, and MCP auth events
    expect(EventManifest.Latest.get("session.drained")).toBe(Drained) // kappacode_change
    expect(EventManifest.Latest.get("session.drain.interrupted")).toBe(Interrupted) // kappacode_change
    expect(EventManifest.Latest.get("session.wakeup")).toBe(WakeupPending) // kappacode_change
    expect(EventManifest.Latest.get("mcp.auth.url")).toBe(AuthUrl) // kappacode_change
    expect(EventManifest.Latest.get("session.next.step.ended")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Latest.get("todo.updated")).toBe(Todo.Event.Updated)
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(EventManifest.Latest.has("server.connected")).toBe(true)
    expect(EventManifest.Latest.has("global.disposed")).toBe(true)
    expect(EventManifest.Latest.has("global.config.updated")).toBe(true) // kappacode_change
  })

  test("contains only the current step settlement versions", () => {
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
  })
})
