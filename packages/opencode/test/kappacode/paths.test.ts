import { test, expect, describe } from "bun:test"
import { KilocodePaths } from "../../src/kappacode/paths"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

async function withHome<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.HOME
  process.env.HOME = home
  try {
    return await fn()
  } finally {
    if (prev) process.env.HOME = prev
    else delete process.env.HOME
  }
}

describe("KilocodePaths", () => {
  describe("skillDirectories", () => {
    test("discovers skills from .kappa/skills/", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const skillDir = path.join(dir, ".kappa", "skills", "test-skill")
          await fs.mkdir(skillDir, { recursive: true })
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: test-skill
description: A test skill
---
# Test instructions`,
          )
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toEndWith(".kappa")
    })

    test("returns empty array when no .kappa/skills/ exists", async () => {
      await using tmp = await tmpdir()

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(0)
    })

    test("discovers skills from nested .kappa directories", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          // Root level skill
          const rootSkillDir = path.join(dir, ".kappa", "skills", "root-skill")
          await fs.mkdir(rootSkillDir, { recursive: true })
          await Bun.write(
            path.join(rootSkillDir, "SKILL.md"),
            `---
name: root-skill
description: Root level skill
---
# Root instructions`,
          )

          // Nested project skill
          const nestedDir = path.join(dir, "packages", "nested")
          const nestedSkillDir = path.join(nestedDir, ".kappa", "skills", "nested-skill")
          await fs.mkdir(nestedSkillDir, { recursive: true })
          await Bun.write(
            path.join(nestedSkillDir, "SKILL.md"),
            `---
name: nested-skill
description: Nested skill
---
# Nested instructions`,
          )
        },
      })

      // Run from nested directory, should find both
      const nestedPath = path.join(tmp.path, "packages", "nested")
      const result = await KilocodePaths.skillDirectories({
        projectDir: nestedPath,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(2)
      const nested = path.join("packages", "nested")
      expect(result.some((d) => d.includes(nested))).toBe(true)
      expect(result.some((d) => !d.includes(nested))).toBe(true)
    })

    test("handles .kappa directory without skills subdirectory", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          // Create .kappa but not skills/
          await fs.mkdir(path.join(dir, ".kappa"), { recursive: true })
          await Bun.write(path.join(dir, ".kappa", "config.json"), "{}")
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(0)
    })

    test("handles symlinked skill directories", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          // Create actual skill in a different location
          const actualDir = path.join(dir, "shared-skills", "my-skill")
          await fs.mkdir(actualDir, { recursive: true })
          await Bun.write(
            path.join(actualDir, "SKILL.md"),
            `---
name: my-skill
description: Symlinked skill
---
# Instructions`,
          )

          // Create .kappa/skills/ and symlink the skill
          const skillsDir = path.join(dir, ".kappa", "skills")
          await fs.mkdir(skillsDir, { recursive: true })
          await fs.symlink(actualDir, path.join(skillsDir, "my-skill"))
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toEndWith(".kappa")
    })

    test("discovers skills from legacy .kappacode/skills/", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const skillDir = path.join(dir, ".kappacode", "skills", "legacy-skill")
          await fs.mkdir(skillDir, { recursive: true })
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: legacy-skill
description: A legacy skill
---
# Legacy instructions`,
          )
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toEndWith(".kappacode")
    })

    test("returns legacy skill dirs before .kappa so .kappa skills win", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          // .kappa skill
          const kappaSkillDir = path.join(dir, ".kappa", "skills", "new-skill")
          await fs.mkdir(kappaSkillDir, { recursive: true })
          await Bun.write(path.join(kappaSkillDir, "SKILL.md"), "# New skill")

          // .kappacode skill
          const legacySkillDir = path.join(dir, ".kappacode", "skills", "old-skill")
          await fs.mkdir(legacySkillDir, { recursive: true })
          await Bun.write(path.join(legacySkillDir, "SKILL.md"), "# Old skill")
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toEndWith(".kappacode")
      expect(result[1]).toEndWith(".kappa")
    })

    test("discovers global skills from ~/.kappa/skills/", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const skillDir = path.join(dir, ".kappa", "skills", "global-skill")
          await fs.mkdir(skillDir, { recursive: true })
          await Bun.write(path.join(skillDir, "SKILL.md"), "# Global skill")
          await fs.mkdir(path.join(dir, "repo"), { recursive: true })
        },
      })

      const result = await withHome(tmp.path, () =>
        KilocodePaths.skillDirectories({
          projectDir: path.join(tmp.path, "repo"),
          worktreeRoot: path.join(tmp.path, "repo"),
        }),
      )

      expect(result.some((d) => d.endsWith(".kappa"))).toBe(true)
    })

    test("discovers multiple skills in same directory", async () => {
      await using tmp = await tmpdir({
        init: async (dir) => {
          const skillsDir = path.join(dir, ".kappa", "skills")

          // First skill
          const skill1 = path.join(skillsDir, "skill-one")
          await fs.mkdir(skill1, { recursive: true })
          await Bun.write(
            path.join(skill1, "SKILL.md"),
            `---
name: skill-one
description: First skill
---
# First`,
          )

          // Second skill
          const skill2 = path.join(skillsDir, "skill-two")
          await fs.mkdir(skill2, { recursive: true })
          await Bun.write(
            path.join(skill2, "SKILL.md"),
            `---
name: skill-two
description: Second skill
---
# Second`,
          )
        },
      })

      const result = await KilocodePaths.skillDirectories({
        projectDir: tmp.path,
        worktreeRoot: tmp.path,
        skipGlobalPaths: true,
      })

      // Should return the .kappa directory (not skills/ subdirectory)
      expect(result).toHaveLength(1)
      expect(result[0]).toEndWith(".kappa")
    })
  })
})
