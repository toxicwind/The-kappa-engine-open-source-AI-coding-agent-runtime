import { ProviderID, type ModelID } from "../schema"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import type { RouteDefaultsInput } from "../route/client"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"

export const id = ProviderID.make("freeinference")

type GenericModelOptions = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly provider?: string
    readonly baseURL: string
  }

export type FamilyModelOptions = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
  }

export const routes = [OpenAICompatibleChat.route]

export const configure = (input: GenericModelOptions) => {
  const provider = input.provider ?? "freeinference"
  const { provider: _, baseURL, apiKey: _apiKey, auth: _auth, ...rest } = input
  const route = OpenAICompatibleChat.route.with({
    ...rest,
    provider,
    endpoint: { baseURL },
    auth: AuthOptions.bearer(input, []),
  })
  return {
    id: ProviderID.make(provider),
    model: (modelID: string | ModelID) => route.model({ id: modelID, provider: ProviderID.make(provider) }),
    configure,
  }
}

const FREEINFERENCE_BASE_URL = "https://freeinference.org/v1"

export const freeinference = {
  id,
  configure: (input: FamilyModelOptions = {}) => {
    const facade = configure({
      ...input,
      baseURL: input.baseURL ?? FREEINFERENCE_BASE_URL,
      provider: "freeinference",
    })
    return {
      id: ProviderID.make("freeinference"),
      model: facade.model,
      configure: facade.configure,
    }
  },
}

export const provider = freeinference
