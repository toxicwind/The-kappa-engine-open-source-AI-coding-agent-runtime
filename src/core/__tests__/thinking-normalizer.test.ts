import { describe, it, expect } from 'bun:test'
import { normalizeThinking } from '../thinking-normalizer'

describe('thinking normalizer', () => {
  it('normalizes by model id', () => {
    expect(normalizeThinking('freeinference/kimi-k3')).toEqual({ reasoning_effort: 'low' })
    expect(normalizeThinking('freeinference/nemotron-3.5')).toEqual({ enable_thinking: false })
    expect(normalizeThinking('freeinference/glm-5.3')).toEqual({ reasoning_effort: 'low' })
    expect(normalizeThinking('freeinference/minimax-m3')).toEqual({ type: 'disabled' })
    expect(normalizeThinking('unknown-model')).toEqual({ type: 'adaptive', effort: 'low' })
  })
})
