export function normalizeThinking(modelId: string){
  if(modelId.includes('kimi-k3')) return { reasoning_effort: 'low' }
  if(modelId.includes('nemotron') || modelId.includes('bolt')) return { enable_thinking: false }
  if(modelId.includes('glm-5.3')) return { reasoning_effort: 'low' }
  if(modelId.includes('minimax') || modelId.includes('argon')) return { type: 'disabled' as const }
  return { type: 'adaptive' as const, effort: 'low' as const }
}
