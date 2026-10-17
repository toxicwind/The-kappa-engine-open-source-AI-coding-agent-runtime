import type { ParentComponent } from "solid-js"
import { ThemeProvider } from "@kappacode/kappa-ui/theme"
import { DialogProvider } from "@kappacode/kappa-ui/context/dialog"
import { Toast } from "@kappacode/kappa-ui/toast"
import { VSCodeProvider } from "./vscode"
import { ServerProvider } from "./server"
import { LanguageBridge } from "./language-bridge"
import { ProviderProvider } from "./provider"
import { ConfigProvider } from "./config"
import { DisplayProvider } from "./display"
import { SpeechToTextPrewarm } from "../components/speech-to-text/SpeechToTextPrewarm"

export const Base: ParentComponent<{ content?: ParentComponent }> = (props) => {
  const Content = props.content ?? ((props) => props.children)
  return (
    <ThemeProvider defaultTheme="kappa-vscode">
      <DialogProvider>
        <VSCodeProvider>
          <ServerProvider>
            <LanguageBridge>
              <Content>
                <ProviderProvider>
                  <ConfigProvider>
                    <SpeechToTextPrewarm />
                    <DisplayProvider>{props.children}</DisplayProvider>
                  </ConfigProvider>
                </ProviderProvider>
              </Content>
            </LanguageBridge>
          </ServerProvider>
        </VSCodeProvider>
        <Toast.Region />
      </DialogProvider>
    </ThemeProvider>
  )
}
