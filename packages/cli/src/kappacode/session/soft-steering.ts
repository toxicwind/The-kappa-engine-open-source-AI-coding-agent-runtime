/**
 * Shared soft-steering signal state for Ctrl+Enter background gesture.
 *
 * When the user presses Ctrl+Enter while a foreground subagent/tool is running,
 * this module's `steer()` method is called to fire a soft abort. The abort
 * signal is observable by the backgrounder wrapper (`raceWithSteering`), which
 * then promotes the running job to background cooperatively instead of
 * hard-killing it.
 *
 * Only one signal is active at a time. Each `steer()` creates a fresh
 * AbortController and signals its `signal` property so consumers can observe
 * it. A previous controller is aborted (its signal's listeners are notified
 * via the abort event) so the old race can lose the race and exit.
 */
export namespace KappaSessionSoftSteering {
  let current: AbortController | undefined

  /**
   * Fire a soft steer. Aborts any previous signal (notifying its listeners)
   * and creates a new one. Returns the new signal for consumers to observe.
   */
  export function steer(): AbortSignal {
    if (current) {
      current.abort()
    }
    const ctrl = new AbortController()
    current = ctrl
    return ctrl.signal
  }

  /**
   * Check whether a soft steer is active (signal has been created but not
   * yet consumed by a running tool). Used to skip redundant firings.
   */
  export function hasSignal(): boolean {
    return current != null
  }

  /**
   * Clear the current signal after it has been consumed. Call from the
   * runtime queue after passing the signal into a tool execution turn.
   */
  export function clear(): void {
    current = undefined
  }

  /**
   * Reset all state. Useful between turns or for testing.
   */
  export function reset(): void {
    if (current) {
      current.abort()
      current = undefined
    }
  }
}
