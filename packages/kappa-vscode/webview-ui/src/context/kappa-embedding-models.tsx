import { createContext, createSignal, onCleanup, useContext, type Accessor, type ParentComponent } from "solid-js"
import {
  EMPTY_KILO_EMBEDDING_MODEL_CATALOG,
  type KappaEmbeddingModelCatalog,
} from "@kappacode/kappa-indexing/embedding-models"
import { useVSCode } from "./vscode"
import type { ExtensionMessage } from "../types/messages"

type KappaEmbeddingModelsContextValue = {
  catalog: Accessor<KappaEmbeddingModelCatalog>
}

export const KappaEmbeddingModelsContext = createContext<KappaEmbeddingModelsContextValue>()

export const KappaEmbeddingModelsProvider: ParentComponent = (props) => {
  const vscode = useVSCode()
  const [catalog, setCatalog] = createSignal<KappaEmbeddingModelCatalog>(EMPTY_KILO_EMBEDDING_MODEL_CATALOG)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "kappaEmbeddingModelsLoaded") return
    setCatalog(message.catalog)
  })

  vscode.postMessage({ type: "requestKappaEmbeddingModels" })

  onCleanup(unsubscribe)

  return <KappaEmbeddingModelsContext.Provider value={{ catalog }}>{props.children}</KappaEmbeddingModelsContext.Provider>
}

export function useKappaEmbeddingModels(): KappaEmbeddingModelsContextValue {
  const context = useContext(KappaEmbeddingModelsContext)
  if (!context) {
    throw new Error("useKappaEmbeddingModels must be used within a KappaEmbeddingModelsProvider")
  }
  return context
}
