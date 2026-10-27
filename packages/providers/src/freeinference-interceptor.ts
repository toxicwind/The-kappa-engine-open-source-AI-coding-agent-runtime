import { normalizeThinking, GOV_HEADERS } from '../../../src/core/thinking-normalizer'
export function intercept(modelId: string, body: any){
  return {
    ...body,
    ...normalizeThinking(modelId),
    headers: GOV_HEADERS
  }
}
