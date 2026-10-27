import type { CommandModule } from "yargs"

type Args = {}

export const GenerateCommand = {
  command: "generate",
  builder: (yargs) => yargs,
  handler: async () => {
    const { Server } = await import("../../server/server")
    const specs = (await Server.openapi()) as {
      info: { title: string; description: string } // kappacode_change
      paths: Record<string, Record<string, any>>
    }
    // kappacode_change start
    specs.info.title = "kappa"
    specs.info.description = "kappa api"
    // kappacode_change end
    for (const item of Object.values(specs.paths)) {
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method]
        if (!operation?.operationId) continue
        operation["x-codeSamples"] = [
          // kappacode_change start
          {
            lang: "js",
            source: [
              `import { createKappaClient } from "@kappacode/sdk"`,
              ``,
              `const client = createKappaClient()`,
              `await client.${operation.operationId}({`,
              `  ...`,
              `})`,
            ].join("\n"),
          },
          // kappacode_change end,
        ]
      }
    }
    // kilocode_change start - Effect 4's OpenAPI generator references the
    // SSE event union by its type-side identifier (V2Event) but only emits
    // the encoded-side component (V2EventEncoded, a JSON string), leaving a
    // dangling $ref that breaks the JS SDK build. Point the stream schema
    // at the component that exists; it describes the wire exactly, since
    // SSE data arrives as JSON text.
    const apiEventSchema = specs.paths["/api/event"]?.get?.responses?.["200"]?.content?.["text/event-stream"]?.schema
    if (apiEventSchema?.$ref === "#/components/schemas/V2Event") {
      apiEventSchema.$ref = "#/components/schemas/V2EventEncoded"
    }
    // kilocode_change end
    const raw = JSON.stringify(specs, null, 2)
      // kappacode_change start - replace upstream product name in all descriptions
      .replaceAll("OpenCode", "Kappa")
      .replaceAll("opencode.local", "kappa.local")
      .replaceAll("opencode serve", "kappa serve")
      .replaceAll("https://opencode.ai/", "https://kilo.ai/")
    // kappacode_change end

    // Format through prettier so output is byte-identical to committed file
    // regardless of whether ./script/format.ts runs afterward.
    const prettier = await import("prettier")
    const babel = await import("prettier/plugins/babel")
    const estree = await import("prettier/plugins/estree")
    const format = prettier.format ?? prettier.default?.format
    const json = await format(raw, {
      parser: "json",
      plugins: [babel.default ?? babel, estree.default ?? estree],
      printWidth: 120,
    })

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  },
} satisfies CommandModule<object, Args>
