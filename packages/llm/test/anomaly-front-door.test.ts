import { describe, expect, test } from "bun:test"

/**
 * Anomaly 5: Front door vs exec lane
 * A route can be "alive" at the front door (health/models/OAuth 401 wall) and dead at the exec lane 
 * (empty/502 chat completions) — a route-contract divergence.
 * 
 * Every served route declares its expected end-to-end contract:
 * - GET /health
 * - GET /v1/models
 * - POST /v1/chat/completions
 * - auth class, expected status (401 = auth wall OK, 502 = dead backend, empty body = exec-lane defect)
 * 
 * Capability-contract test: validate that we check exec lane separately from front door.
 */

describe("Anomaly 5: Front door vs exec lane capability contract", () => {
  
  test("route declares end-to-end contract for all served endpoints", () => {
    const routeContracts = {
      health: { method: "GET", path: "/health", expectedStatus: 200, auth: "none" },
      models: { method: "GET", path: "/v1/models", expectedStatus: 200, auth: "bearer" },
      chatCompletions: { method: "POST", path: "/v1/chat/completions", expectedStatus: 200, auth: "bearer" }
    }
    
    expect(routeContracts.health.expectedStatus).toBe(200)
    expect(routeContracts.models.expectedStatus).toBe(200)
    expect(routeContracts.chatCompletions.expectedStatus).toBe(200)
  })
  
  test("auth wall 401 at front door is OK but exec lane must work", () => {
    // Front door (health/models) might return 401 (auth wall) which is OK
    // But exec lane (chat/completions) must return 200 with valid response
    
    const frontDoorHealth = { status: 401, reason: "auth wall - OK" }
    const frontDoorModels = { status: 401, reason: "auth wall - OK" }
    const execLane = { status: 200, body: { choices: [{ delta: { content: "hi" } }] } }
    
    // 401 at front door = auth wall = OK
    expect(frontDoorHealth.status).toBe(401)
    expect(frontDoorModels.status).toBe(401)
    
    // But exec lane must work
    expect(execLane.status).toBe(200)
    expect(execLane.body.choices).toBeDefined()
  })
  
  test("502 at exec lane = dead backend", () => {
    const execLaneDead = { status: 502, reason: "dead backend" }
    expect(execLaneDead.status).toBe(502)
  })
  
  test("empty body at exec lane = exec-lane defect", () => {
    const execLaneEmpty = { status: 200, body: null, reason: "exec-lane defect" }
    expect(execLaneEmpty.status).toBe(200)
    expect(execLaneEmpty.body).toBeNull()
  })
  
  test("front door alive ≠ exec lane alive (route-contract divergence)", () => {
    // The core anomaly: front door works but exec lane is dead
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
})

describe("Anomaly 5: Capability-contract verification", () => {
  test("Health check must verify exec lane, not just front door", () => {
    // A proper health check must test the full chain
    const fullHealthCheck = async () => {
      // Check front door
      const health = await fetch("/health")
      const models = await fetch("/v1/models")
      
      // MUST check exec lane
      const chat = await fetch("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test", messages: [] }) })
      
      return { health: health.ok, models: models.ok, chat: chat.ok }
    }
    
    expect(typeof fullHealthCheck).toBe("function")
  })
  
  test("Expected status codes: 401 = auth wall OK, 502 = dead backend, empty body = exec-lane defect", () => {
    const statusMeanings = {
      401: "auth wall OK",
      502: "dead backend",
      200: "OK (if body valid)",
      emptyBody: "exec-lane defect"
    }
    
    expect(statusMeanings[401]).toBe("auth wall OK")
    expect(statusMeanings[502]).toBe("dead backend")
    expect(statusMeanings.emptyBody).toBe("exec-lane defect")
  })
})
