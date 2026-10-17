import type { KappaClient } from "@kappacode/sdk/v2/client"

export async function stopSessionProcesses(
  client: KappaClient | null,
  sessionID: string,
  directory: string,
): Promise<void> {
  if (!client) return
  await client.backgroundProcess
    .stopSession({ sessionID, directory })
    .catch((err: unknown) => console.warn("[Kappa New] KappaProvider: Failed to stop background processes:", err))
}
