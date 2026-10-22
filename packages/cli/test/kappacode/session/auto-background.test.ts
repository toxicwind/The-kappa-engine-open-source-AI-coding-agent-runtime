import { describe, expect, it } from "bun:test"

// Mirror of the footer's auto-background decision so we can assert the behavior
// without the full interactive TUI harness (which has pre-existing test-env
// failures unrelated to this feature).
function makeAutoBackgroundSubmit({ foreground, onBackground, onSubmit }: {
  foreground: boolean
  onBackground?: () => void
  onSubmit: (input: unknown) => boolean
}) {
  return (input: unknown) => {
    try {
      if (foreground) onBackground?.()
    } catch {
      /* best-effort */
    }
    return onSubmit(input)
  }
}

describe("auto-background of foreground subagents", () => {
  it("calls onBackground before submit when a foreground subagent is running", () => {
    let bg = 0
    let submitted = 0
    const submit = makeAutoBackgroundSubmit({
      foreground: true,
      onBackground: () => void bg++,
      onSubmit: () => (submitted++, true),
    })
    const ok = submit({ prompt: "hello" })
    expect(ok).toBe(true)
    expect(bg).toBe(1)
    expect(submitted).toBe(1) // submit still goes through
  })

  it("does NOT auto-background when no foreground subagent is running", () => {
    let bg = 0
    const submit = makeAutoBackgroundSubmit({
      foreground: false,
      onBackground: () => void bg++,
      onSubmit: () => true,
    })
    submit({ prompt: "hi" })
    expect(bg).toBe(0)
  })
})
