import { afterEach, expect, test } from "bun:test"
import { createKappaClient } from "@kappacode/sdk/v2"
import { Server } from "../../src/server/server.ts"
import { disposeAllInstances, tmpdir } from "../fixture/fixture.ts"
import { resetDatabase } from "../fixture/db.ts"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

test("blocking TUI bootstrap requests complete", async () => {
  await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
  const client = createKappaClient({
    baseUrl: "http://kappa.internal",
    directory: tmp.path,
    fetch: ((request: RequestInfo | URL, init?: RequestInit) =>
      Server.Default().app.fetch(new Request(request, init))) as typeof fetch,
  })

  const responses = await Promise.all([
    client.config.providers({}, { throwOnError: true }),
    client.provider.list({}, { throwOnError: true }),
    client.experimental.capabilities.get({}, { throwOnError: true }),
    client.app.agents({}, { throwOnError: true }),
    client.config.get({}, { throwOnError: true }),
    client.global.config.get({ throwOnError: true }),
  ])

  for (const response of responses) expect(response.data).toBeDefined()
})
