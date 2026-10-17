export * from "./client.js"
export * from "./server.js"

import { createKappaClient } from "./client.js"
import { createKappaServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createKappa(options?: ServerOptions) {
  const server = await createKappaServer({
    ...options,
  })

  const client = createKappaClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
