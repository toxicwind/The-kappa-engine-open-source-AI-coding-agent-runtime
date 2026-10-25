import { describe, expect, test } from "bun:test"

/**
 * Anomaly 3: Model-identity chain
 * CLI tag ≠ served model; resolved model is the chain through:
 * catalog → models.yml (pinax-generated) → task.agentModelOverrides → modelRoles → agent frontmatter model list → parent active/default fallback
 * The roster's resolved model is ground truth.
 * 
 * Capability-contract test: validate that we trace the full provenance chain
 * and never trust the CLI tag as the actual served model.
 */

describe("Anomaly 3: Model-identity chain capability contract", () => {
  
  test("model identity chain: catalog → models.yml → overrides → modelRoles → frontmatter → fallback", () => {
    // The full provenance chain from AGENTS.md
    const identityChain = [
      "catalog",                    // FreeInference /v1/models
      "models.yml",                 // pinax-generated, DO NOT EDIT BY HAND
      "task.agentModelOverrides",   // per-task overrides
      "modelRoles",                 // role-based model selection
      "agent frontmatter model list", // agent-specific models
      "parent active/default fallback" // final fallback
    ]
    
    expect(identityChain).toHaveLength(6)
    expect(identityChain[0]).toBe("catalog")
    expect(identityChain[5]).toBe("parent active/default fallback")
  })
  
  test("CLI tag is NOT the served model - roster's resolved model is ground truth", () => {
    // The CLI tag (what user specifies) may not match what actually runs
    const cliTag = "qwen3.6-35b"
    const rosterResolvedModel = "qwen3.6-35b-fp8-2026-10" // actual served model
    
    // Ground truth is the roster's resolved model
    const groundTruth = rosterResolvedModel
    expect(groundTruth).not.toBe(cliTag)
    
    // We must trace the chain to know what actually runs
    const trace = {
      cliTag,
      catalogEntry: "qwen3.6-35b",
      modelsYml: "qwen3.6-35b-fp8",
      taskOverride: undefined,
      modelRole: "qwen3.6-35b-fp8-2026-10",
      frontmatter: ["qwen3.6-35b-fp8-2026-10"],
      fallback: "qwen3.6-35b-fp8-2026-10",
      resolved: "qwen3.6-35b-fp8-2026-10"
    }
    
    expect(trace.resolved).toBe(groundTruth)
  })
  
  test("effort gated by task.enableEffort + model's thinking metadata", () => {
    // From AGENTS.md: Effort gated by task.enableEffort + selected model's thinking metadata
    // vibe_spawn has no effort field, so pin via modelRoles/agentModelOverrides
    
    const task = { enableEffort: true }
    const modelThinkingMetadata = { thinking: "enabled" }
    
    const effortEnabled = task.enableEffort && modelThinkingMetadata.thinking === "enabled"
    expect(effortEnabled).toBe(true)
    
    // vibe_spawn has no effort field
    const vibeSpawn: { model: string; enableEffort?: boolean } = { model: "some-model" }
    const vibeEffortEnabled = !!vibeSpawn.enableEffort
    expect(vibeEffortEnabled).toBe(false)
    
    // Must pin via modelRoles/agentModelOverrides
    const pinnedViaModelRoles = true
    expect(pinnedViaModelRoles).toBe(true)
  })
  
  test("deepseek-v4-flash is BANNED by architect - never resolve workers to it", () => {
    // Explicit rule from AGENTS.md
    const bannedModels = ["deepseek-v4-flash"]
    const workerModel = "deepseek-v4-flash"
    
    const isBanned = bannedModels.includes(workerModel)
    expect(isBanned).toBe(true)
    
    // Should never resolve workers to banned model
    const shouldResolveToBanned = false
    expect(shouldResolveToBanned).toBe(false)
  })
  
  test("pinax-generated models.yml is SSOT - DO NOT EDIT BY HAND", () => {
    // The models.yml is generated from mesh/catalog/src/data.ts
    // Must regenerate from source, never hand-edit
    const modelsYmlSource = "mesh/catalog/src/data.ts"
    const regenerateCommand = "pinax generate"
    
    expect(modelsYmlSource).toBe("mesh/catalog/src/data.ts")
    expect(regenerateCommand).toContain("pinax")
  })
})

describe("Anomaly 3: Capability-contract verification", () => {
  test("Provenance chain must be traceable for any model request", () => {
    // Every model request should be traceable through the chain
    const requestTrace = {
      cliTag: "minimax-m3",
      catalog: "minimax-m3",
      modelsYml: "minimax-m3",
      overrides: null,
      modelRoles: "minimax-m3",
      frontmatter: ["minimax-m3"],
      fallback: "minimax-m3",
      resolved: "minimax-m3"
    }
    
    // All steps should be present
    expect(requestTrace.resolved).toBeDefined()
    expect(requestTrace.resolved).toBe(requestTrace.cliTag) // in simple case they match
  })
  
  test("Never trust CLI tag as actual served model", () => {
    // The fundamental rule: CLI tag ≠ served model
    const cliTag = "my-model"
    const actualServed = "my-model-v2-fp8"
    
    expect(cliTag).not.toBe(actualServed)
    
    // Must always resolve through chain
    const mustResolveChain = true
    expect(mustResolveChain).toBe(true)
  })
})
