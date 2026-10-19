import { createMemo, Match, Switch, type JSX } from "solid-js"
import { SplitBorder } from "@tui/ui/border"
import { useTheme } from "@tui/context/theme"
import { parseKappaErrorCode, kappaErrorTitle, kappaErrorDescription } from "@/kappacode/kappa-errors"
import type { AssistantMessage } from "@kappacode/sdk/v2"

interface KappaErrorBlockProps {
  error: NonNullable<AssistantMessage["error"]>
  fallback: JSX.Element
}

export function KappaErrorBlock(props: KappaErrorBlockProps) {
  const { theme } = useTheme()

  const kappaErrorCode = createMemo(() => {
    return parseKappaErrorCode(props.error)
  })

  const title = createMemo(() => {
    const code = kappaErrorCode()
    return code ? kappaErrorTitle(code) : undefined
  })

  const description = createMemo(() => {
    const code = kappaErrorCode()
    return code ? kappaErrorDescription(code) : undefined
  })

  return (
    <Switch fallback={props.fallback}>
      <Match when={kappaErrorCode()}>
        <box
          border={["left"]}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={theme.primary}
        >
          <text fg={theme.text}>{title()}</text>
          <text fg={theme.textMuted}>{description()}</text>
          <text fg={theme.primary}>{"Run /connect or `kappa auth login` to connect to Kilo Gateway"}</text>
        </box>
      </Match>
    </Switch>
  )
}
