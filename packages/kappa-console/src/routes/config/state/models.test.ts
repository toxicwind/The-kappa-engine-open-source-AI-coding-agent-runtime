import { describe, expect, test } from "bun:test"
import { hasGateway, visible } from "./privacy"

describe("model privacy filter", () => {
  test("detects when Kappa Gateway models are present", () => {
    expect(hasGateway([{ id: "kappa" }, { id: "openai" }])).toBe(true)
    expect(hasGateway([{ id: "openai" }])).toBe(false)
  })

  test("shows every model when disabled", () => {
    expect(visible({ id: "kappa" }, { mayTrainOnYourPrompts: true }, false)).toBe(true)
  })

  test("hides only Kappa Gateway models explicitly marked for prompt training", () => {
    expect(visible({ id: "kappa" }, { mayTrainOnYourPrompts: true }, true)).toBe(false)
    expect(visible({ id: "kappa" }, { mayTrainOnYourPrompts: false }, true)).toBe(true)
    expect(visible({ id: "kappa" }, {}, true)).toBe(true)
    expect(visible({ id: "openai" }, { mayTrainOnYourPrompts: true }, true)).toBe(true)
  })
})
