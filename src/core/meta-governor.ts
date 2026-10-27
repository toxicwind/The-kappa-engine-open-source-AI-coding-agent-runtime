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
