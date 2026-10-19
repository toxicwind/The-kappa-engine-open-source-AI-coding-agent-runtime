import { EOL } from "os"
import { Effect } from "effect"
import { Skill } from "../../../skill/index.ts"
import { effectCmd } from "../../effect-cmd.ts"

export const SkillCommand = effectCmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.skill")(function* () {
    const skill = yield* Skill.Service
    const skills = yield* skill.all()
    process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
  }),
})
