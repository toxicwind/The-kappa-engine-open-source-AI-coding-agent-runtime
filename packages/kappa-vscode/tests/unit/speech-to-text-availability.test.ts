import { describe, expect, it } from "bun:test"
import {
  canUseSpeechToText,
  selectedSpeechToTextModel,
} from "../../webview-ui/src/components/speech-to-text/availability"
import { DEFAULT_SPEECH_TO_TEXT_MODEL } from "../../src/speech-to-text/models"

describe("speech-to-text availability", () => {
  it("shows speech input for stored Kappa credentials", () => {
    expect(canUseSpeechToText({}, { kappa: "oauth" })).toBe(true)
    expect(canUseSpeechToText({}, { kappa: "api" })).toBe(true)
  })

  it("hides speech input without usable Kappa credentials", () => {
    expect(canUseSpeechToText({}, {})).toBe(false)
    expect(canUseSpeechToText({}, { kappa: "wellknown" })).toBe(false)
  })

  it("honors enabled and disabled provider configuration", () => {
    expect(canUseSpeechToText({ disabled_providers: ["kappa"] }, { kappa: "oauth" })).toBe(false)
    expect(canUseSpeechToText({ enabled_providers: ["openai"] }, { kappa: "oauth" })).toBe(false)
    expect(canUseSpeechToText({ enabled_providers: ["kappa"] }, { kappa: "oauth" })).toBe(true)
  })

  it("hides speech input when the window cannot capture audio", () => {
    expect(canUseSpeechToText({}, { kappa: "oauth" }, false)).toBe(false)
    expect(canUseSpeechToText({}, { kappa: "oauth" }, true)).toBe(true)
  })

  it("normalizes configured and unknown transcription models", () => {
    expect(
      selectedSpeechToTextModel({ experimental: { speech_to_text_model: "google/chirp-3" } }, [
        { id: "google/chirp-3", label: "Chirp 3", provider: "Google" },
      ]),
    ).toBe("google/chirp-3")
    expect(selectedSpeechToTextModel({ experimental: { speech_to_text_model: "unknown/model" } })).toBe(
      DEFAULT_SPEECH_TO_TEXT_MODEL.id,
    )
  })
})
