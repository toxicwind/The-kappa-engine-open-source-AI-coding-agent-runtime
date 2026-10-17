import type { WorkspaceV2 } from "@opencode-ai/core/workspace" // kappacode_change
import { dispose } from "@/kappacode/effect/instance-registry" // kappacode_change

const disposers = new Set<(directory: string, workspaceID?: WorkspaceV2.ID) => Promise<void>>() // kappacode_change

// kappacode_change start
export function registerDisposer(
  disposer: (directory: string, workspaceID?: WorkspaceV2.ID) => Promise<void>, // kappacode_change
) {
  disposers.add(disposer)
  return () => {
    disposers.delete(disposer)
  }
}

export async function disposeInstance(directory: string, workspaceID?: WorkspaceV2.ID) {
  await dispose(directory, workspaceID, () =>
    Promise.allSettled([...disposers].map((disposer) => disposer(directory, workspaceID))),
  )
}
// kappacode_change end
