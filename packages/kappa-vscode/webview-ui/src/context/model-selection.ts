import type { ModelSelection, Provider } from "../types/messages"
import { isModelValid } from "./provider-utils"

export function resolveModelSelection(input: {
  providers: Record<string, Provider>
  connected: string[]
  ready?: boolean
  organizationId?: string | null
  defaults?: Record<string, string>
  session?: ModelSelection | null
  mode?: ModelSelection | null
  global?: ModelSelection | null
  recent?: ModelSelection[]
  fallback?: ModelSelection | null
}): ModelSelection | null {
  const pending = input.ready === false || (input.ready !== undefined && input.organizationId === undefined)
  const validate = (selection: ModelSelection | null | undefined) => {
    if (!selection || (pending && selection.providerID === "kappa")) return null
    return isModelValid(input.providers, input.connected, selection) ? selection : null
  }
  const preference = validate(input.session) ?? validate(input.mode) ?? validate(input.global)
  if (preference) return preference
  if (pending) return null
  if (input.organizationId) {
    const recommendation = input.defaults?.kappa
    const selection = recommendation ? validate({ providerID: "kappa", modelID: recommendation }) : null
    if (selection) return selection
    const first = Object.keys(input.providers.kappa?.models ?? {}).at(0)
    return first ? validate({ providerID: "kappa", modelID: first }) : null
  }
  for (const selection of input.recent ?? []) {
    const model = validate(selection)
    if (model) return model
  }
  return validate(input.fallback)
}
