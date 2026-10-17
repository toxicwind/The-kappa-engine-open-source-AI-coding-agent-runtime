import { createContext, onCleanup, onMount, useContext, type ParentComponent } from "solid-js"
import { MarkedProvider } from "@kappacode/kappa-ui/context/marked"
import { CodeComponentProvider } from "@kappacode/kappa-ui/context/code"
import { DiffComponentProvider } from "@kappacode/kappa-ui/context/diff"
import { FileComponentProvider } from "@kappacode/kappa-ui/context/file"
import { Code } from "@kappacode/kappa-ui/code"
import { Diff } from "@kappacode/kappa-ui/diff"
import { File } from "@kappacode/kappa-ui/file"
import { useVSCode } from "./vscode"

const Context = createContext(false)

export const RichProvider: ParentComponent = (props) => {
  if (useContext(Context)) return props.children
  const vscode = useVSCode()
  onMount(() => {
    const save = (event: Event) => {
      const detail = (event as CustomEvent<{ dataUrl: string; filename: string }>).detail
      if (!detail?.dataUrl || !detail.filename) return
      event.preventDefault()
      vscode.postMessage({ type: "saveImage", dataUrl: detail.dataUrl, filename: detail.filename })
    }
    window.addEventListener("kappa:save-image", save)
    onCleanup(() => window.removeEventListener("kappa:save-image", save))
  })

  return (
    <Context.Provider value={true}>
      <MarkedProvider>
        <DiffComponentProvider component={Diff}>
          <CodeComponentProvider component={Code}>
            <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
          </CodeComponentProvider>
        </DiffComponentProvider>
      </MarkedProvider>
    </Context.Provider>
  )
}
