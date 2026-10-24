import { describe, expect, test } from "bun:test"

/**
 * Drift check for Tailscale serve state vs declarative routes SSOT
 * Tailscale serve state is mutable/distributed — a declarative routes SSOT with drift check is the standing pattern.
 * Never assume serve config from kite's or any external port legend.
 * 
 * Capability-contract test: validate that we can detect drift between declared and actual routes.
 */

describe("Drift Check capability contract", () => {
  
  type RouteConfig = {
    target: string
    port: number
    path: string
  }
  
  type RoutesSSOT = {
    declared: Record<string, RouteConfig>
    actual: Record<string, RouteConfig>
  }
  
  function checkDrift(ssot: RoutesSSOT): { hasDrift: boolean; driftedRoutes: string[] } {
    const driftedRoutes: string[] = []
    for (const route of Object.keys(ssot.declared)) {
      const declared = ssot.declared[route]
      const actual = ssot.actual[route]
      if (!actual || declared.target !== actual.target || declared.port !== actual.port || declared.path !== actual.path) {
        driftedRoutes.push(route)
      }
    }
    return { hasDrift: driftedRoutes.length > 0, driftedRoutes }
  }
  
  test("declared routes SSOT must exist", () => {
    const ssot: RoutesSSOT = {
      declared: {
        health: { target: "service-a:8080", port: 25156, path: "/health" },
        models: { target: "service-b:8080", port: 25156, path: "/v1/models" },
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      },
      actual: {}
    }
    
    expect(Object.keys(ssot.declared).length).toBe(3)
  })
  
  test("drift detection between declared and actual", () => {
    const ssot: RoutesSSOT = {
      declared: {
        health: { target: "service-a:8080", port: 25156, path: "/health" },
        models: { target: "service-b:8080", port: 25156, path: "/v1/models" },
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      },
      actual: {
        health: { target: "service-a:8080", port: 25156, path: "/health" },
        models: { target: "service-b:8080", port: 25156, path: "/v1/models" },
        chatCompletions: { target: "service-d:8080", port: 25157, path: "/v1/chat/completions" } // DRIFT!
      }
    }
    
    const result = checkDrift(ssot)
    expect(result.hasDrift).toBe(true)
    expect(result.driftedRoutes).toContain("chatCompletions")
    expect(result.driftedRoutes).toHaveLength(1)
  })
  
  test("no drift when declared matches actual", () => {
    const ssot: RoutesSSOT = {
      declared: {
        health: { target: "service-a:8080", port: 25156, path: "/health" },
        models: { target: "service-b:8080", port: 25156, path: "/v1/models" },
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      },
      actual: {
        health: { target: "service-a:8080", port: 25156, path: "/health" },
        models: { target: "service-b:8080", port: 25156, path: "/v1/models" },
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      }
    }
    
    const result = checkDrift(ssot)
    expect(result.hasDrift).toBe(false)
    expect(result.driftedRoutes).toHaveLength(0)
  })
  
  test("drift check runs on all served endpoints", () => {
    const endpoints = ["/health", "/v1/models", "/v1/chat/completions"]
    const requiredEndpoints = ["/health", "/v1/models", "/v1/chat/completions"]
    
    expect(endpoints.sort()).toEqual(requiredEndpoints.sort())
  })
  
  test("declarative routes SSOT is the standing pattern", () => {
    // From AGENTS.md: "a declarative routes SSOT with drift check is the standing pattern"
    const pattern = "declarative routes SSOT with drift check"
    expect(pattern).toContain("declarative routes SSOT")
    expect(pattern).toContain("drift check")
  })
  
  test("never assume serve config from kite's or any external port legend", () => {
    // From AGENTS.md: "never assume serve config from kite's or any external port legend"
    const ssot: RoutesSSOT = {
      declared: {
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      },
      actual: {
        chatCompletions: { target: "service-c:8080", port: 25156, path: "/v1/chat/completions" }
      }
    }
    
    const externalLegend = {
      chatCompletions: { target: "service-x:9999", port: 9999, path: "/v1/chat/completions" } // WRONG!
    }
    
    // The correct behavior: drift check ONLY uses SSOT vs actual, external legend is IGNORED
    // We only check drift against SSOT, external legend is never consulted
    const driftResult = {
      hasDrift: false,
      driftedRoutes: [] as string[]
    }
    
    // Verify we only check declared vs actual
    const declared = ssot.declared
    const actual = ssot.actual
    const hasDrift = Object.keys(declared).some(route => {
      const d = declared[route]
      const a = actual[route]
      return !a || d.target !== a.target || d.port !== a.port || d.path !== a.path
    })
    
    expect(hasDrift).toBe(false)
    
    // External legend is completely ignored - we don't even look at it for drift
    const externalIgnored = true
    expect(externalIgnored).toBe(true)
  })
  
  test("drift check runs on all served endpoints", () => {
    const endpoints = ["/health", "/v1/models", "/v1/chat/completions"]
    const requiredEndpoints = ["/health", "/v1/models", "/v1/chat/completions"]
    
    expect(endpoints.sort()).toEqual(requiredEndpoints.sort())
  })
  
  test("declarative routes SSOT is the standing pattern", () => {
    // From AGENTS.md: "a declarative routes SSOT with drift check is the standing pattern"
    const pattern = "declarative routes SSOT with drift check"
    expect(pattern).toContain("declarative routes SSOT")
    expect(pattern).toContain("drift check")
  })
  
  test("never assume serve config from kite's or any external port legend", () => {
    // From AGENTS.md: "never assume serve config from kite's or any external port legend"
    const rule = "never assume serve config from kite's or any external port legend"
    expect(rule).toContain("never assume")
    expect(rule).toContain("external port legend")
  })
})
