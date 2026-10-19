import type { MessageV2 } from "@/session/message-v2"

export namespace KappaPartLifecycle {
  export const key = "kappacode.lifecycle"

  export function transient(part: MessageV2.Part) {
    return part.type === "text" && part.metadata?.[key] === "transient"
  }
}
