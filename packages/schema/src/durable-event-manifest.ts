export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { Schema } from "effect" // kappacode_change
import { SessionEvent } from "./session-event"
import { SessionV1 } from "./session-v1"
import { PromptPromoted } from "./kappacode/durable-event" // kappacode_change - released storage key

// kappacode_change start - retain the released prompt promotion event for history and replay
const definitions = Event.inventory(...SessionEvent.DurableDefinitions, PromptPromoted)
const schema = Schema.Union(definitions, { mode: "oneOf" })
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "SessionDurableEvent" })
export type SessionDurableEvent = typeof schema.Type
// kappacode_change end

export const SessionDurable = {
  definitions: Event.durable(definitions), // kappacode_change
  schema, // kappacode_change
} as const

export const Durable = Event.durable([
  ...SessionV1.Event.Definitions.filter((definition) => definition.durable !== undefined),
  ...definitions, // kappacode_change
])
