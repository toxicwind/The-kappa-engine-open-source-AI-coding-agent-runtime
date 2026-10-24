/**
 * SSE Anomaly Resilience & Capability Fingerprinting for Kappa
 * Addresses: missing [DONE] sentinel, buffered tool arguments, early-close HTTP 200, heartbeat hangs, delta.reasoning normalization.
 */

export const TERMINAL_REASONS = new Set(['stop', 'tool_calls', 'length', 'content_filter', 'function_call'])

export interface SSEStreamState {
  hasDone: boolean
  terminalReasonSeen: boolean
  chunksReceived: number
  hasHeartbeatAfterTerminal: boolean
}

export function parseSSEChunk(line: string, state: SSEStreamState): { action: 'continue' | 'finalize' | 'ignore', data?: any } {
  if (line.startsWith(':')) {
    if (state.terminalReasonSeen) {
      state.hasHeartbeatAfterTerminal = true
    }
    return { action: 'ignore' }
  }
  if (line === 'data: [DONE]') {
    state.hasDone = true
    return { action: 'finalize' }
  }
  if (line.startsWith('data: ')) {
    state.chunksReceived++
    try {
      const json = JSON.parse(line.slice(6))
      const choice = json.choices?.[0]
      if (choice?.finish_reason && TERMINAL_REASONS.has(choice.finish_reason)) {
        state.terminalReasonSeen = true
      }
      // Normalize non-standard delta.reasoning to delta.reasoning_content
      if (choice?.delta && 'reasoning' in choice.delta && !('reasoning_content' in choice.delta)) {
        choice.delta.reasoning_content = choice.delta.reasoning
        delete choice.delta.reasoning
      }
      return { action: 'continue', data: json }
    } catch {
      return { action: 'ignore' }
    }
  }
  return { action: 'ignore' }
}

export function shouldCloseStream(state: SSEStreamState): boolean {
  if (state.hasDone) return true
  if (state.terminalReasonSeen && (state.hasHeartbeatAfterTerminal || !state.hasDone)) {
    // Gracefully finalize without [DONE] if terminal reason was observed
    return true
  }
  return false
}

export function reassembleToolArguments(existingArgs: string, newChunkArgs: string): string {
  if (!existingArgs) return newChunkArgs
  // If the new chunk is a complete superset or replaces the whole blob (minimax buffered behavior)
  if (newChunkArgs.startsWith('{') && newChunkArgs.length >= existingArgs.length) {
    return newChunkArgs
  }
  return existingArgs + newChunkArgs
}

export function shouldRetryEarlyClose(statusCode: number, chunksReceived: number, retryCount: number): boolean {
  return statusCode === 200 && chunksReceived === 0 && retryCount < 1
}

export class ModelToolCapabilityRegistry {
  private rejectingModels = new Set<string>()

  recordToolRejection(modelId: string) {
    this.rejectsModel(modelId)
    this.rejectingModels.add(modelId)
  }

  rejectsModel(modelId: string): boolean {
    return this.rejectingModels.has(modelId)
  }
}
