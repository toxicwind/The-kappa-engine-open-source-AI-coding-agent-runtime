import { resolveKappaGatewayBaseUrl } from "@kappacode/kappa-gateway"
import { HEADER_FEATURE, HEADER_ORGANIZATIONID } from "@kappacode/kappa-gateway"
import { MAX_ITEM_TOKENS } from "../constants"
import type { EmbedderInfo, EmbeddingResponse, IEmbedder } from "../interfaces/embedder"
import { Log } from "../../util/log"
import { OpenAICompatibleEmbedder } from "./openai-compatible"

const log = Log.create({ service: "embedder-kappa" })

export const KILO_INDEXING_FEATURE = "managed-indexing"

export class KappaEmbedder implements IEmbedder {
  private readonly embedder: OpenAICompatibleEmbedder
  private readonly model: string

  constructor(input: {
    apiKey: string
    baseUrl?: string
    organizationId?: string
    modelId?: string
    dimensions?: number
  }) {
    if (!input.apiKey) throw new Error("Kappa API key is required for embedding.")

    if (!input.modelId) throw new Error("Kappa embedding model is required.")
    this.model = input.modelId
    const headers: Record<string, string> = {
      [HEADER_FEATURE]: KILO_INDEXING_FEATURE,
      ...(input.organizationId ? { [HEADER_ORGANIZATIONID]: input.organizationId } : {}),
    }

    this.embedder = new OpenAICompatibleEmbedder(
      resolveKappaGatewayBaseUrl({ baseURL: input.baseUrl, token: input.apiKey }),
      input.apiKey,
      this.model,
      MAX_ITEM_TOKENS,
      { headers, dimensions: input.dimensions },
    )
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    try {
      return await this.embedder.createEmbeddings(texts, model || this.model)
    } catch (err) {
      log.error("Kappa embedder error", {
        err: err instanceof Error ? err.message : String(err),
        location: "KappaEmbedder:createEmbeddings",
      })
      throw err
    }
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      return await this.embedder.validateConfiguration()
    } catch (err) {
      log.error("Kappa embedder validation error", {
        err: err instanceof Error ? err.message : String(err),
        location: "KappaEmbedder:validateConfiguration",
      })
      throw err
    }
  }

  get embedderInfo(): EmbedderInfo {
    return { name: "kappa" }
  }
}
