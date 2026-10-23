import { describe, expect, it } from "bun:test"
import { KappaBackgrounder } from "@/kappacode/tool/backgrounder"

describe("KappaBackgrounder", () => {
  describe("getDeadline", () => {
    it("returns kairos ceiling when flag is undefined", () => {
      expect(KappaBackgrounder.getDeadline(undefined)).toBe(4_000)
    })

    it("returns kairos ceiling when flag is null", () => {
      expect(KappaBackgrounder.getDeadline(null as unknown as number)).toBe(4_000)
    })

    it("returns kairos ceiling when flag is zero", () => {
      expect(KappaBackgrounder.getDeadline(0)).toBe(4_000)
    })

    it("returns the flag value when it is a positive number", () => {
      expect(KappaBackgrounder.getDeadline(5_000)).toBe(5_000)
      expect(KappaBackgrounder.getDeadline(90_000)).toBe(90_000)
    })

    it("returns kairos ceiling for negative values", () => {
      expect(KappaBackgrounder.getDeadline(-1_000)).toBe(4_000)
    })

    it("returns kairos ceiling as the default from runtime-flags", () => {
      expect(KappaBackgrounder.KAIROS_CEILING_MS).toBe(4_000)
      expect(KappaBackgrounder.getDeadline(undefined)).toBe(KappaBackgrounder.KAIROS_CEILING_MS)
    })
  })

  describe("Settlement type", () => {
    it("settled type carries status, output, error", () => {
      const settled: KappaBackgrounder.Settlement = {
        type: "settled",
        info: { status: "completed", output: "done" },
      }
      expect(settled.type).toBe("settled")
      expect(settled.info.status).toBe("completed")
      expect(settled.info.output).toBe("done")
    })

    it("promoted type carries jobId", () => {
      const promoted: KappaBackgrounder.Settlement = {
        type: "promoted",
        info: { background: true, jobId: "sess_abc123" as never },
      }
      expect(promoted.type).toBe("promoted")
    })
  })
})
