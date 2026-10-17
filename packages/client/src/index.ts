export * from "./generated/index"
export type { EventsSubscribeOutput as OpenCodeEvent } from "./generated/types"

// kappacode_change start - compatibility with upstream session-ui's legacy Promise client type
export type FileDiffInfo = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}
// kappacode_change end
