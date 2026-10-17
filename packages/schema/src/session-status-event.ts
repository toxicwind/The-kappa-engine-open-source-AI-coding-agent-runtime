export * as SessionStatusEvent from "./session-status-event"

import { Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"
import { NonNegativeInt } from "./schema"
import { SessionID } from "./session-id"

const QuestionID = Schema.String.check(Schema.isStartsWith("que")).pipe(Schema.brand("QuestionID")) // kappacode_change

export const Info = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("idle"),
  }),
  Schema.Struct({
    type: Schema.Literal("retry"),
    attempt: NonNegativeInt,
    message: Schema.String,
    action: optional(
      Schema.Struct({
        reason: Schema.String,
        provider: Schema.String,
        title: Schema.String,
        message: Schema.String,
        label: Schema.String,
        link: optional(Schema.String),
      }),
    ),
    next: NonNegativeInt,
  }),
  Schema.Struct({
    type: Schema.Literal("busy"),
  }),
  // kappacode_change start - represent a session paused for an offline Kappa question
  Schema.Struct({
    type: Schema.Literal("offline"),
    requestID: QuestionID,
    message: Schema.String,
  }),
  // kappacode_change end
  // kappacode_change start - represent a session asleep on a pending wakeup
  Schema.Struct({
    type: Schema.Literal("scheduled"),
    scheduledAt: Schema.String,
  }),
  // kappacode_change end
]).annotate({ identifier: "SessionStatus" })
export type Info = Schema.Schema.Type<typeof Info>

export const Status = Event.define({
  type: "session.status",
  schema: {
    sessionID: SessionID,
    status: Info,
  },
})

// deprecated
export const Idle = Event.define({
  type: "session.idle",
  schema: {
    sessionID: SessionID,
  },
})

export const Definitions = Event.inventory(Status, Idle)
