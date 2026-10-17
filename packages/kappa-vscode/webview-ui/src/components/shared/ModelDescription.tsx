import { Markdown } from "@kappacode/kappa-ui/markdown"
import type { ComponentProps } from "solid-js"
import { RichProvider } from "../../context/rich-provider"

export default function ModelDescription(props: ComponentProps<typeof Markdown>) {
  return (
    <RichProvider>
      <Markdown {...props} />
    </RichProvider>
  )
}
