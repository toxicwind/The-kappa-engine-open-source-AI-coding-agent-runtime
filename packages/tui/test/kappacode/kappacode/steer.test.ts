import { expect, test } from "bun:test"
import { KappaSteer } from "../../src/kappacode/steer"

const child = {
  parentID: "ses_parent",
  agent: "explore",
  model: { id: "sub-model", providerID: "sub", variant: "high" },
}
const root = { agent: "code", model: { id: "main-model", providerID: "main" } }

test("a steering prompt keeps the child's agent, model, and variant", () => {
  expect(KappaSteer.prompt(child)).toEqual({
    agent: "explore",
    model: { providerID: "sub", modelID: "sub-model" },
    variant: "high",
  })
})

test("primary sessions keep the current selection", () => {
  for (const session of [root, undefined]) {
    expect(KappaSteer.prompt(session)).toEqual({})
    expect(KappaSteer.mark(session)).toEqual({})
    expect(KappaSteer.steering(session)).toBe(false)
  }
})

test("a default child variant clears the primary variant instead of inheriting it", () => {
  const plain = { ...child, model: { ...child.model, variant: "default" } }
  expect(KappaSteer.prompt(plain)).toEqual({
    agent: "explore",
    model: { providerID: "sub", modelID: "sub-model" },
    variant: undefined,
  })
})

test("only subagent text is marked as a human steer", () => {
  expect(KappaSteer.mark(child)).toEqual({ metadata: { kind: "subagent_steer" } })
  expect(KappaSteer.steering(child)).toBe(true)
})

test("subagent views accept input only while the child is running", () => {
  expect(KappaSteer.open(child, "busy")).toBe(true)
  expect(KappaSteer.open(child, "retry")).toBe(true)
  expect(KappaSteer.open(child, "idle")).toBe(false)
  expect(KappaSteer.open(child, undefined)).toBe(false)
  expect(KappaSteer.open(root, "idle")).toBe(true)
})

test("subagent-view keys yield only once the focused prompt has text", () => {
  expect(KappaSteer.idle(undefined)).toBe(true)
  expect(KappaSteer.idle({ focused: false, current: { input: "draft" } })).toBe(true)
  expect(KappaSteer.idle({ focused: true, current: { input: "" } })).toBe(true)
  expect(KappaSteer.idle({ focused: true, current: { input: "draft" } })).toBe(false)
})

test("the steered agent comes from the session, then its latest reply, then the task title", () => {
  const title = "inspect bug (@explore subagent)"
  expect(KappaSteer.agent({ agent: "general", title }, "build")).toBe("general")
  expect(KappaSteer.agent({ title }, "build")).toBe("build")
  expect(KappaSteer.agent({ title })).toBe("explore")
  expect(KappaSteer.agent({ title: "untitled" })).toBeUndefined()
  expect(KappaSteer.agent(undefined)).toBeUndefined()
})

test("the steered model shows display names and falls back to raw ids", () => {
  const providers = [{ id: "sub", name: "Sub Provider", models: { "sub-model": { name: "Sub Model" } } }]
  expect(KappaSteer.model({ id: "sub-model", providerID: "sub" }, providers)).toEqual({
    name: "Sub Model",
    provider: "Sub Provider",
  })
  expect(KappaSteer.model({ id: "gone", providerID: "missing" }, providers)).toEqual({
    name: "gone",
    provider: "missing",
  })
  expect(KappaSteer.model(undefined, providers)).toBeUndefined()
})
