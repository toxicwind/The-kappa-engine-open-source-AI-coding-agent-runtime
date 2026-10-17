import type { ParentComponent } from "solid-js"
import { IndexingProvider } from "./indexing"
import { KappaEmbeddingModelsProvider } from "./kappa-embedding-models"
import { ImageModelsProvider } from "./image-models"
import { SpeechToTextModelsProvider } from "./speech-to-text-models"
import { NotificationsProvider } from "./notifications"
import { SessionProvider } from "./session"

export const Session: ParentComponent = (props) => (
  <IndexingProvider>
    <KappaEmbeddingModelsProvider>
      <ImageModelsProvider>
        <SpeechToTextModelsProvider>
          <NotificationsProvider>
            <SessionProvider>{props.children}</SessionProvider>
          </NotificationsProvider>
        </SpeechToTextModelsProvider>
      </ImageModelsProvider>
    </KappaEmbeddingModelsProvider>
  </IndexingProvider>
)
