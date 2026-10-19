import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { KappaSessionPromptQueue } from "../../../src/kappacode/session/prompt-queue.ts"
import { Suggestion } from "../../../src/kappacode/suggestion/index.ts"
import { provideTestInstance } from "../../fixture/fixture.ts"
import { MessageID, SessionID } from "../../../src/session/schema.ts"
import { tmpdir } from "../../fixture/fixture.ts"

describe("Suggestion.show auto-dismiss on queued followup", () => {
  test("show rejects immediately when a followup is queued on the session", async () => {
    // A tool that calls Suggestion.show after a queued prompt has arrived would
    // otherwise block the turn on user input. Verify the pre-emptive
    // hasFollowup check rejects with DismissedError before any pending entry
    // is registered or a Shown event is published.
    await using tmp = await tmpdir({ git: true })
    await provideTestInstance({
      directory: tmp.path,
      fn: async () => {
        const sessionID = SessionID.make("ses_auto_show")
        const started = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()

        // Slot 1 stays running so activeSince is pinned to its seq.
        const first = Effect.runPromise(
          KappaSessionPromptQueue.enqueue(
            sessionID,
            MessageID.make("msg_show_1"),
            Effect.gen(function* () {
              started.resolve()
              yield* Effect.promise(() => release.promise)
              return "first" as const
            }),
            Effect.succeed("first-cancelled" as const),
          ),
        )
        await started.promise

        // Slot 2 arrives while slot 1 is active — latest > activeSince.
        const second = Effect.runPromise(
          KappaSessionPromptQueue.enqueue(
            sessionID,
            MessageID.make("msg_show_2"),
            Effect.succeed("second" as const),
            Effect.succeed("second-cancelled" as const),
          ),
        )
        await Bun.sleep(10)
        expect(KappaSessionPromptQueue.hasFollowup(sessionID)).toBe(true)

        await expect(
          Suggestion.show({
            sessionID,
            text: "Continue with the task?",
            actions: [{ label: "Continue", prompt: "Continue with the task" }],
          }),
        ).rejects.toBeInstanceOf(Suggestion.DismissedError)
        expect(await Suggestion.list()).toEqual([])

        release.resolve()
        expect(await first).toBe("first")
        expect(await second).toBe("second")
      },
    })
  })
})
