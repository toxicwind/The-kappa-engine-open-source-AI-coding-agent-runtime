import { describe, it, expect } from 'bun:test'
import { shape, shouldSkipTool, shouldBreakThinking, GOV_HEADERS } from '../meta-governor'

describe('meta-governor', () => {
  it('shapes commands correctly', () => {
    expect(shape('pactl list sinks short abc12345678 123456')).toBe('pactl list sinks short # #')
  })
  it('detects identical tool calls for loop guard', () => {
    seen_reset: { (shouldSkipTool as any).seen?.clear?.() }
    const name = 'pactl'
    const args = 'list sinks short'
    expect(shouldSkipTool(name, args)).toBeNull()
    expect(shouldSkipTool(name, args)).toBeNull()
    const res = shouldSkipTool(name, args)
    expect(res).toEqual({ kind: 'identical', tool: 'pactl', count: 3 })
  })
  it('detects thinking similarity via Jaccard', () => {
    expect(shouldBreakThinking('balanced vs unbalanced theory')).toBe(false)
    expect(shouldBreakThinking('balanced vs unbalanced theory')).toBe(true)
  })
  it('has gov headers', () => {
    expect(GOV_HEADERS['X-Reasoning-Passthrough']).toBe('false')
  })
})
