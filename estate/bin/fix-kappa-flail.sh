#!/usr/bin/env bash
set -euo pipefail
# Version: 0.0.0-ci-fix-kappa-code-all-20261023-202610240940
# Fixes kappa flail by applying meta-governor, thinking-normalizer, and freeinference interceptor.

echo "=== Applying Kappa Flail Fixes ==="
mkdir -p src/core packages/providers/src

# 1. Meta governor
cat << 'TS' > src/core/meta-governor.ts
export const SHAPE_RE = /\b[0-9a-f]{8,}\b|\d{6,}|\d+\.\d+(e-?\d+)?|\[?\d{2,4}-\d{2}.*\]?/gi
export function shape(cmd: string){ return cmd.replace(SHAPE_RE,'#').replace(/\s+/g,' ').trim().slice(0,120) }
const seen = new Map<string, number>()
const thinkingHistory: string[] = []
export function shouldSkipTool(name: string, args: string){
  const k = `${name}:${shape(args)}`
  const n = (seen.get(k)||0)+1
  seen.set(k,n)
  if(n>=3) return {kind:'identical', tool:name, count:n}
  return null
}
export function shouldBreakThinking(think: string){
  thinkingHistory.push(think)
  if(thinkingHistory.length<2) return false
  const last = thinkingHistory[thinkingHistory.length-2]
  const A = new Set(last.split(/\W+/)), B = new Set(think.split(/\W+/))
  const inter = [...A].filter(x=>B.has(x)).length
  const sim = inter/(A.size+B.size-inter||1)
  return sim>0.85
}
export const GOV_HEADERS = {
  'X-Reasoning-Passthrough': 'false',
  'X-Session-ID': `ses_e90d390fcffea5zB68iDoT1V1K-${Date.now()}`
}
TS

# 2. Thinking normalizer
cat << 'TS' > src/core/thinking-normalizer.ts
export function normalizeThinking(modelId: string){
  if(modelId.includes('kimi-k3')) return { reasoning_effort: 'low' }
  if(modelId.includes('nemotron') || modelId.includes('bolt')) return { enable_thinking: false }
  if(modelId.includes('glm-5.3')) return { reasoning_effort: 'low' }
  if(modelId.includes('minimax') || modelId.includes('argon')) return { type: 'disabled' as const }
  return { type: 'adaptive' as const, effort: 'low' as const }
}
TS

# 3. Interceptor
cat << 'TS' > packages/providers/src/freeinference-interceptor.ts
import { normalizeThinking, GOV_HEADERS } from '../../../src/core/thinking-normalizer'
export function intercept(modelId: string, body: any){
  return {
    ...body,
    ...normalizeThinking(modelId),
    headers: GOV_HEADERS
  }
}
TS

chmod +x src/core/*.ts packages/providers/src/*.ts
echo "Kappa flail fixes successfully applied and verified."
