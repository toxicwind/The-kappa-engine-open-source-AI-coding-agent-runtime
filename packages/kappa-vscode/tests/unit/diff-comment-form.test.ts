import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it("routes the unified diff composer to Kappa, GitHub, save, and cancel", () => fixture("diff-comment-form"), 30_000)
