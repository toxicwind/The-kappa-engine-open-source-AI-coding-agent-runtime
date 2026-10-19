import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { EventPaths } from "../../src/server/routes/instance/httpapi/groups/event.ts"
import { PtyPaths } from "../../src/server/routes/instance/httpapi/groups/pty.ts"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server.ts"
import { ServerAuth } from "../../src/server/auth.ts"
import { PtyID } from "@opencode-ai/core/pty/schema"
import { resetDatabase } from "../fixture/db.ts"
import { disposeAllInstances, tmpdir } from "../fixture/fixture.ts"

function app(input: { password?: string; username?: string }) {
  const handler = HttpRouter.toWebHandler(
    HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          // kappacode_change start - keep the filewatcher-disable flag visible so the
          // @parcel/watcher Windows backend does not subscribe on temp dirs that
          // the tmpdir fixture deletes mid-test (throws "Invalid handle").
          ConfigProvider.fromUnknown({
            KAPPA_SERVER_PASSWORD: input.password,
            KAPPA_SERVER_USERNAME: input.username,
            KAPPA_EXPERIMENTAL_DISABLE_FILEWATCHER: process.env.KAPPA_EXPERIMENTAL_DISABLE_FILEWATCHER ?? "true",
          }),
          // kappacode_change end
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    fetch: (request: Request) => handler(request, HttpApiApp.context),
    request(input: string | URL | Request, init?: RequestInit) {
      return this.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init))
    },
  }
}

function basic(username: string, password: string) {
  return ServerAuth.header({ username, password }) ?? ""
}

async function cancelBody(response: Response) {
  await response.body?.cancel().catch(() => {})
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("HttpApi instance route authorization", () => {
  test("requires configured auth before opening the instance event stream", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const server = app({ password: "secret" })
    const headers = { "x-kappa-directory": tmp.path }

    const missing = await server.request(EventPaths.event, { headers })
    await cancelBody(missing)
    expect(missing.status).toBe(401)

    const authed = await server.request(EventPaths.event, {
      headers: { ...headers, authorization: basic("kappa", "secret") }, // kappacode_change - Kappa username default
    })
    await cancelBody(authed)
    expect(authed.status).toBe(200)
  })

  test("requires configured auth before resolving the PTY websocket route", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const server = app({ password: "secret" })
    const route = PtyPaths.connect.replace(":ptyID", PtyID.ascending())
    const headers = { "x-kappa-directory": tmp.path }

    const missing = await server.request(route, { headers })
    await cancelBody(missing)
    expect(missing.status).toBe(401)

    const authed = await server.request(route, {
      headers: { ...headers, authorization: basic("kappa", "secret") }, // kappacode_change - Kappa username default
    })
    await cancelBody(authed)
    expect(authed.status).toBe(404)
  })
})
