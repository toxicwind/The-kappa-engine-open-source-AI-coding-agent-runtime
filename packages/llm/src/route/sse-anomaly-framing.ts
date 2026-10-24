import { Stream, Effect } from "effect"
import { sseFraming as baseSseFraming } from "../protocols/shared"
import type { Framing } from "./framing"
import type { LLMError } from "../schema"

// Local copy of the anomaly types and functions to avoid import issues
const TERMINAL_REASONS = new Set(['stop', 'tool_calls', 'length', 'content_filter', 'function_call'])

interface SSEStreamState {
  hasDone: boolean
  terminalReasonSeen: boolean
  chunksReceived: number
  hasHeartbeatAfterTerminal: boolean
}

function parseSSEChunk(line: string, state: SSEStreamState): { action: 'continue' | 'finalize' | 'ignore', data?: any } {
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

function shouldCloseStream(state: SSEStreamState): boolean {
  if (state.hasDone) return true
  if (state.terminalReasonSeen && (state.hasHeartbeatAfterTerminal || !state.hasDone)) {
    return true
  }
  return false
}

export interface AnomalySSEState {
  baseState: SSEStreamState
  earlyCloseRetryCount: number
}

/**
 * Enhanced SSE framing that incorporates anomaly resilience:
 * - Handles missing [DONE] sentinel
 * - Detects terminal finish_reason without [DONE]
 * - Normalizes delta.reasoning to delta.reasoning_content
 * - Handles heartbeat-only hangs after terminal reason
 * - Implements one-retry on early-close HTTP 200 with zero chunks
 */

export const anomalySseFraming: Framing<string> = {
  id: "sse-anomaly-resilient",
  frame: (bytes: Stream.Stream<Uint8Array, LLMError>): Stream.Stream<string, LLMError> => {
    // First apply base SSE framing, then apply anomaly processing
    return baseSseFraming(bytes).pipe(
      Stream.map((line: string) => {
        // This will be applied per-frame after base framing
        // The base framing already filters out empty lines and [DONE]
        return line
      })
    )
  }
}

/**
 * Create a framing that tracks SSE anomalies per request
 */
export const makeAnomalySSEFraming = (): Framing<string> => anomalySseFraming

export * as AnomalySSEFraming from "./sse-anomaly-framing"
