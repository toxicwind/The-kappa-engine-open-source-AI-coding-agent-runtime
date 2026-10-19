import { afterEach, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import path from "path"
import { KappacodePaths } from "../../src/kappacode/server/httpapi/groups/kappacode.ts"
import * as HttpApiServer from "../../src/server/routes/instance/httpapi/server.ts"
import { resetDatabase } from "../fixture/db.ts"
import { disposeAllInstances, tmpdir } from "../fixture/fixture.ts"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

test("refreshes cached config after failed plugin install and partial removal", async () => {
  await using tmp = await tmpdir({ config: { formatter: false, lsp: false, username: "before" } })
  const { handler, dispose } = HttpRouter.toWebHandler(
    HttpApiServer.routes.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))),
    { disableLogger: true },
  )
  async function request(route: string, body?: unknown) {
    const response = await handler(
      new Request(`http://localhost${route}`, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", "x-kappa-directory": tmp.path },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      HttpApiServer.context,
    )
    expect(response.status).toBe(200)
    return response.json()
  }
  try {
    expect((await request("/config")).username).toBe("before")
    const file = path.join(tmp.path, "opencode.json")
    await Bun.write(file, JSON.stringify({ formatter: false, lsp: false, username: "after-install" }))
    const installed = await request(KappacodePaths.marketplaceInstall, {
      item: { type: "plugin", id: "wrong-id", content: "some-package" },
      target: "project",
    })
    expect(installed.success).toBe(false)
    expect((await request("/config")).username).toBe("after-install")

    await Bun.write(
      file,
      JSON.stringify({ formatter: false, lsp: false, username: "after-remove", plugin: ["some-package"] }),
    )
    const tui = path.join(tmp.path, ".kappa", "tui.json")
    await Bun.write(tui, "{ malformed")
    const removed = await request(KappacodePaths.marketplaceRemove, {
      item: { type: "plugin", id: "some-package" },
      scope: "project",
    })
    expect(removed.success).toBe(false)
    expect(removed.error).toContain(file)
    expect(removed.error).toContain(tui)
    const config = await request("/config")
    expect(config.username).toBe("after-remove")
    expect(config.plugin).not.toContain("some-package")
    expect(await Bun.file(tui).text()).toBe("{ malformed")
    await Bun.write(tui, "{}")
    expect(
      (
        await request(KappacodePaths.marketplaceRemove, {
          item: { type: "plugin", id: "some-package" },
          scope: "project",
        })
      ).success,
    ).toBe(true)
  } finally {
    await dispose()
  }
})
