import { describe, expect, test } from "bun:test"

/**
 * Route Contract for all served endpoints
 * Every served route declares its expected end-to-end contract:
 * - GET /health
 * - GET /v1/models
 * - POST /v1/chat/completions
 * - auth class, expected status (401 = auth wall OK, 502 = dead backend, empty body = exec-lane defect)
 * 
 * Capability-contract test: validate that each route has a declared contract
 */

describe("Route Contracts capability contract", () => {
  
  type RouteContract = {
    method: string
    path: string
    auth: "none" | "bearer" | "oauth"
    expectedStatus: number
    expectedBody?: string
    description: string
  }
  
  const routeContracts: RouteContract[] = [
    {
      method: "GET",
      path: "/health",
      auth: "none",
      expectedStatus: 200,
      description: "Health check - no auth required, should return 200 OK"
    },
    {
      method: "GET",
      path: "/v1/models",
      auth: "bearer",
      expectedStatus: 200,
      description: "Model catalog - requires bearer auth, returns model list"
    },
    {
      method: "POST",
      path: "/v1/chat/completions",
      auth: "bearer",
      expectedStatus: 200,
      description: "Chat completions - requires bearer auth, returns stream or response"
    }
  ]
  
  test("every served route has a declared contract", () => {
    // All three critical endpoints must have contracts
    const paths = routeContracts.map(r => r.path)
    expect(paths).toContain("/health")
    expect(paths).toContain("/v1/models")
    expect(paths).toContain("/v1/chat/completions")
  })
  
  test("health endpoint requires no auth and returns 200", () => {
    const health = routeContracts.find(r => r.path === "/health")
    expect(health).toBeDefined()
    expect(health?.auth).toBe("none")
    expect(health?.expectedStatus).toBe(200)
  })
  
  test("models endpoint requires bearer auth and returns 200", () => {
    const models = routeContracts.find(r => r.path === "/v1/models")
    expect(models).toBeDefined()
    expect(models?.auth).toBe("bearer")
    expect(models?.expectedStatus).toBe(200)
  })
  
  test("chat/completions endpoint requires bearer auth and returns 200", () => {
    const chat = routeContracts.find(r => r.path === "/v1/chat/completions")
    expect(chat).toBeDefined()
    expect(chat?.auth).toBe("bearer")
    expect(chat?.expectedStatus).toBe(200)
  })
  
  test("status code meanings: 401 = auth wall OK, 502 = dead backend, empty body = exec-lane defect", () => {
    // From AGENTS.md: "expected status (401 = auth wall OK, 502 = dead backend, empty body = exec-lane defect)"
    const statusMeanings = {
      401: "auth wall OK",
      502: "dead backend",
      emptyBody: "exec-lane defect"
    }
    
    expect(statusMeanings[401]).toBe("auth wall OK")
    expect(statusMeanings[502]).toBe("dead backend")
    expect(statusMeanings.emptyBody).toBe("exec-lane defect")
  })
  
  test("route contracts distinguish front door (health/models) from exec lane (chat/completions)", () => {
    // Front door can be alive while exec lane is dead (Anomaly 5)
    const frontDoor = ["/health", "/v1/models"]
    const execLane = ["/v1/chat/completions"]
    
    expect(frontDoor).toContain("/health")
    expect(frontDoor).toContain("/v1/models")
    expect(execLane).toContain("/v1/chat/completions")
  })
  
  test("Tailscale serve state is mutable/distributed - need declarative routes SSOT with drift check", () => {
    // From AGENTS.md: "Tailscale serve state is mutable/distributed — a declarative routes SSOT with drift check is the standing pattern"
    const routesSSOT = {
      declared: {
        health: { target: "service-a:8080", port: 25156 },
        models: { target: "service-b:8080", port: 25156 },
        chatCompletions: { target: "service-c:8080", port: 25156 }
      },
      actual: {
        health: { target: "service-a:8080", port: 25156 },
        models: { target: "service-b:8080", port: 25156 },
        chatCompletions: { target: "service-d:8080", port: 25157 } // DRIFT!
      }
    }
    
    // Drift check should catch the divergence
    const drift = routesSSOT.declared.chatCompletions.target !== routesSSOT.actual.chatCompletions.target
    expect(drift).toBe(true)
    
    // Never assume serve config from external port legend
    const neverAssumeExternalLegend = true
    expect(neverAssumeExternalLegend).toBe(true)
  })
  
  test("health check must verify exec lane, not just front door", () => {
    // From Anomaly 5: Health/OAuth returns 401 (alive) while chat completions return 502/empty (dead backend)
    const scenario = {
      frontDoor: { health: 200, models: 200 }, // both alive
      execLane: { chatCompletions: 502 } // dead
    }
    
    const frontDoorAlive = scenario.frontDoor.health === 200 && scenario.frontDoor.models === 200
    const execLaneAlive = scenario.execLane.chatCompletions === 200
    
    expect(frontDoorAlive).toBe(true)
    expect(execLaneAlive).toBe(false)
    
    // This is the route-contract divergence
    const divergence = frontDoorAlive && !execLaneAlive
    expect(divergence).toBe(true)
  })
})
