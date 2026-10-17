import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { Component } from "solid-js"
import { CodeComponentProvider } from "@kappacode/kappa-ui/context/code"
import { DiffComponentProvider } from "@kappacode/kappa-ui/context/diff"
import { FileComponentProvider } from "@kappacode/kappa-ui/context/file"
import { MarkedProvider } from "@kappacode/kappa-ui/context/marked"
import { Code } from "@kappacode/kappa-ui/code"
import { Diff } from "@kappacode/kappa-ui/diff"
import { File } from "@kappacode/kappa-ui/file"
import { ThemeProvider } from "@kappacode/kappa-ui/theme"
import { RadioGroup } from "@kappacode/kappa-ui/radio-group"
import { LanguageProvider, useLanguage } from "../src/context/language"
import { ServerProvider, useServer } from "../src/context/server"
import { getVSCodeAPI, VSCodeProvider } from "../src/context/vscode"
import { VirtualDiffView, type VirtualDiffFile } from "../diff-viewer/VirtualDiffView"

type DiffStyle = "unified" | "split"

const DiffVirtualContent: Component = () => {
  const { t } = useLanguage()
  const [diff, setDiff] = createSignal<VirtualDiffFile | null>(null)
  const [style, setStyle] = createSignal<DiffStyle>("unified")
  const [markdown, setMarkdown] = createSignal(false)
  const files = createMemo(() => {
    const current = diff()
    return current?.files?.length ? current.files : current ? [current] : []
  })

  const handler = (event: MessageEvent) => {
    const msg = event.data as {
      type: string
      diff?: VirtualDiffFile
      initialDiffStyle?: DiffStyle
      markdownRender?: boolean
    }
    if (msg?.type === "diffVirtual.data" && msg.diff) {
      setDiff(msg.diff)
      setStyle(msg.initialDiffStyle ?? "unified")
      setMarkdown(msg.markdownRender === true)
    }
  }

  window.addEventListener("message", handler)
  onCleanup(() => window.removeEventListener("message", handler))

  return (
    <Show when={files().length > 0}>
      <div class="am-review-layout">
        <div class="am-review-toolbar">
          <div class="am-review-toolbar-left">
            <RadioGroup
              options={["unified", "split"] as const}
              current={style()}
              value={(value) => value}
              label={(value) =>
                value === "unified" ? t("ui.sessionReview.diffStyle.unified") : t("ui.sessionReview.diffStyle.split")
              }
              size="small"
              onSelect={(value) => {
                if (value) {
                  setStyle(value)
                  getVSCodeAPI().postMessage({ type: "diffVirtual.setDiffStyle", style: value })
                }
              }}
            />
          </div>
        </div>
        <div class="am-edit-preview-files">
          <For each={files()}>
            {(current) => (
              <VirtualDiffView
                diff={current}
                diffStyle={style()}
                onDiffStyleChange={setStyle}
                markdownRender={markdown()}
                onMarkdownRenderChange={(render) => {
                  setMarkdown(render)
                  getVSCodeAPI().postMessage({ type: "diffVirtual.setMarkdownRender", render })
                }}
                styleSelect={false}
              />
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

const DiffVirtualShell: Component = () => {
  const server = useServer()

  return (
    <LanguageProvider vscodeLanguage={server.vscodeLanguage} languageOverride={server.languageOverride}>
      <DiffComponentProvider component={Diff}>
        <CodeComponentProvider component={Code}>
          <FileComponentProvider component={File}>
            <MarkedProvider>
              <DiffVirtualContent />
            </MarkedProvider>
          </FileComponentProvider>
        </CodeComponentProvider>
      </DiffComponentProvider>
    </LanguageProvider>
  )
}

export const DiffVirtualApp: Component = () => {
  return (
    <ThemeProvider defaultTheme="kappa-vscode">
      <VSCodeProvider>
        <ServerProvider>
          <DiffVirtualShell />
        </ServerProvider>
      </VSCodeProvider>
    </ThemeProvider>
  )
}
