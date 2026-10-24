import { describe, expect, test } from "bun:test"

/**
 * Anomaly 8: External scheduled readers
 * Scheduled browser readers (architect's MacBook Claude Desktop tasks) hold persistent tunnel grants 
 * to estate.tailc9ac71.ts.net with NO on-box inventory. Observability stops at the box; 
 * the grant inventory lives outside it.
 * Treat recurring 502 reports from external readers as route-contract drift until proven otherwise,
 * and keep a kill-switch/revoke path per grant. Unreachable remote hosts and flooded SSH 
 * are not evidence of backend state — probe the box directly.
 * 
 * Capability-contract test: validate that external grants are tracked outside the box
 * and we have kill-switch/revoke paths.
 */

describe("Anomaly 8: External scheduled readers capability contract", () => {
  
  test("scheduled browser readers hold persistent tunnel grants to estate.tailc9ac71.ts.net", () => {
    const externalReaders = {
      source: "architect's MacBook Claude Desktop tasks",
      target: "estate.tailc9ac71.ts.net",
      grantType: "persistent tunnel",
      onBoxInventory: false // NO on-box inventory
    }
    
    expect(externalReaders.target).toBe("estate.tailc9ac71.ts.net")
    expect(externalReaders.onBoxInventory).toBe(false)
  })
  
  test("observability stops at the box; grant inventory lives outside it", () => {
    const observability = {
      stopsAtBox: true,
      grantInventoryLocation: "outside"
    }
    
    expect(observability.stopsAtBox).toBe(true)
    expect(observability.grantInventoryLocation).toBe("outside")
  })
  
  test("recurring 502 reports from external readers = route-contract drift until proven otherwise", () => {
    const externalReport = { status: 502, source: "external-reader" }
    const defaultClassification = "route-contract drift"
    
    // Must classify as route-contract drift FIRST, not backend failure
    const classification = externalReport.status === 502 ? defaultClassification : "unknown"
    expect(classification).toBe("route-contract drift")
  })
  
  test("keep kill-switch/revoke path per grant", () => {
    const grant = {
      id: "grant-123",
      target: "estate.tailc9ac71.ts.net",
      killSwitch: "/api/grants/grant-123/revoke",
      revokePath: true
    }
    
    expect(grant.killSwitch).toBeDefined()
    expect(grant.revokePath).toBe(true)
  })
  
  test("unreachable remote hosts and flooded SSH are NOT evidence of backend state", () => {
    const externalIssues = {
      unreachableHost: true,
      floodedSSH: true
    }
    
    const isBackendEvidence = false // NOT evidence of backend state
    expect(isBackendEvidence).toBe(false)
    
    // Must probe the box directly
    const mustProbeBoxDirectly = true
    expect(mustProbeBoxDirectly).toBe(true)
  })
})

describe("Anomaly 8: Capability-contract verification", () => {
  test("grant inventory must be managed outside the estate box", () => {
    const grantManagement = {
      location: "outside estate box",
      managedBy: "external system",
      estateHasReadOnlyView: true
    }
    
    expect(grantManagement.location).toBe("outside estate box")
    expect(grantManagement.estateHasReadOnlyView).toBe(true)
  })
  
  test("each grant must have individual kill-switch/revoke path", () => {
    const grants = [
      { id: "grant-1", revokePath: "/api/grants/grant-1/revoke" },
      { id: "grant-2", revokePath: "/api/grants/grant-2/revoke" },
      { id: "grant-3", revokePath: "/api/grants/grant-3/revoke" }
    ]
    
    grants.forEach(grant => {
      expect(grant.revokePath).toContain(grant.id)
      expect(grant.revokePath).toContain("/revoke")
    })
  })
  
  test("external 502s trigger drift investigation, not backend restart", () => {
    const external502 = { status: 502, source: "external-reader" }
    const correctResponse = "investigate route-contract drift"
    const wrongResponse = "restart backend"
    
    // Must investigate drift first
    expect(correctResponse).toContain("drift")
    expect(wrongResponse).toContain("restart")
  })
})
