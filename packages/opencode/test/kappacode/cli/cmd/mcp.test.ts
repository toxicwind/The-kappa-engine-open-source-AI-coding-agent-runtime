import { describe, expect, test } from "bun:test"
import { KappacodeMcpConfig } from "@/kappacode/cli/cmd/mcp"

const added = `{
  "permission": {
    "bash": "allow"
  },
  "mcp": {
    "linear": {
      "type": "remote",
      "url": "https://mcp.linear.app/mcp",
      "oauth": {}
    }
  },
}`

describe("KappacodeMcpConfig.format", () => {
  test("writes strict JSON for kappa.json", () => {
    const output = KappacodeMcpConfig.format("/tmp/kappa.json", added)

    expect(JSON.parse(output)).toEqual({
      permission: { bash: "allow" },
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          oauth: {},
        },
      },
    })
    expect(output).not.toEndWith(",\n}")
  })

  test("preserves JSONC formatting for kappa.jsonc", () => {
    expect(KappacodeMcpConfig.format("/tmp/kappa.jsonc", added)).toBe(added)
  })
})
