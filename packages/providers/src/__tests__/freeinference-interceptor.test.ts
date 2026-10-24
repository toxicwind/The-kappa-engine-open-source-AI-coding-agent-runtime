import { describe, it, expect } from 'bun:test'
import { intercept } from '../freeinference-interceptor'

describe('freeinference interceptor', () => {
  it('intercepts request body and adds normalization and headers', () => {
    const res = intercept('freeinference/minimax-m3', { messages: [] })
    expect(res.type).toBe('disabled')
    expect(res.headers).toBeDefined()
    expect(res.headers['X-Reasoning-Passthrough']).toBe('false')
  })
})
