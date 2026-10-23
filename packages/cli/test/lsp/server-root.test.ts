import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import * as LSPServer from "@/lsp/server"
import { tmpdir } from "../fixture/fixture.ts"

const mk = (p: string) => fs.mkdir(p, { recursive: true })

describe("lsp.server root resolution", () => {
  test("Deno root finds deno.json in nearest directory", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "a", "b", "c")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "deno.json"), "{}")
    const result = await LSPServer.Deno.root(path.join(deepDir, "mod.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Deno root returns undefined when no deno.json found", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "a", "b", "c")
    await mk(deepDir)
    await Bun.write(path.join(deepDir, "mod.ts"), "")
    const result = await LSPServer.Deno.root(path.join(deepDir, "mod.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBeUndefined()
  })

  test("Typescript root finds lock file in nearest directory", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "a", "b", "c")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "bun.lock"), "")
    const result = await LSPServer.Typescript.root(path.join(deepDir, "mod.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Typescript root returns undefined when no lock file", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "a", "b", "c")
    await mk(deepDir)
    await Bun.write(path.join(deepDir, "mod.ts"), "")
    const result = await LSPServer.Typescript.root(path.join(deepDir, "mod.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBeUndefined()
  })

  test("Typescript root excludes deno.json projects", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "a", "b", "c")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "deno.json"), "{}")
    await Bun.write(path.join(tmp.path, "bun.lock"), "")
    const result = await LSPServer.Typescript.root(path.join(deepDir, "mod.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBeUndefined()
  })

  test("Vue root finds package-lock.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src", "components")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "package-lock.json"), "{}")
    const result = await LSPServer.Vue.root(path.join(deepDir, "App.vue"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Biome root finds biome.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "biome.json"), "{}")
    const result = await LSPServer.Biome.root(path.join(deepDir, "app.ts"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Gopls root finds go.mod", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "cmd", "main")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "go.mod"), "module example.com/foo\n")
    const result = await LSPServer.Gopls.root(path.join(deepDir, "main.go"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("RustAnalyzer root finds Cargo.toml", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src", "lib")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "Cargo.toml"), '[package]\nname = "foo"\n')
    const result = await LSPServer.RustAnalyzer.root(path.join(deepDir, "lib.rs"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("RustAnalyzer stops at workspace Cargo.toml", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "crates", "inner")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "Cargo.toml"), '[workspace]\nmembers = ["crates/inner"]\n')
    await Bun.write(path.join(deepDir, "Cargo.toml"), '[package]\nname = "inner"\n')
    const result = await LSPServer.RustAnalyzer.root(path.join(deepDir, "lib.rs"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Pyright root finds pyproject.toml", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src", "myapp")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "pyproject.toml"), '[project]\nname = "myapp"\n')
    const result = await LSPServer.Pyright.root(path.join(deepDir, "app.py"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Svelte root finds package-lock.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "package-lock.json"), "{}")
    const result = await LSPServer.Svelte.root(path.join(deepDir, "App.svelte"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("YamlLS root finds package-lock.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "config")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "package-lock.json"), "{}")
    const result = await LSPServer.YamlLS.root(path.join(deepDir, "deploy.yaml"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("BashLS root returns directory", async () => {
    await using tmp = await tmpdir()
    const result = await LSPServer.BashLS.root(path.join(tmp.path, "script.sh"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("DockerfileLS root returns directory", async () => {
    await using tmp = await tmpdir()
    const result = await LSPServer.DockerfileLS.root("Dockerfile", { directory: tmp.path, worktree: tmp.path } as any)
    expect(result).toBe(tmp.path)
  })

  test("TerraformLS root finds .tf file in parent", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "infra")
    await mk(deepDir)
    await Bun.write(path.join(deepDir, "main.tf"), "resource {}")
    const result = await LSPServer.TerraformLS.root(path.join(deepDir, "main.tf"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(deepDir)
  })

  test("ElixirLS root finds mix.exs", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "lib")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "mix.exs"), "")
    const result = await LSPServer.ElixirLS.root(path.join(deepDir, "app.ex"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("LuaLS root finds .luarc.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "lua")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, ".luarc.json"), "{}")
    const result = await LSPServer.LuaLS.root(path.join(deepDir, "main.lua"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Ocaml root finds dune-project", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "dune-project"), "(lang dune 3.0)")
    const result = await LSPServer.Ocaml.root(path.join(deepDir, "main.ml"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Dart root finds pubspec.yaml", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "lib")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "pubspec.yaml"), "name: myapp\n")
    const result = await LSPServer.Dart.root(path.join(deepDir, "main.dart"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Prisma root finds schema.prisma", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "prisma")
    await mk(deepDir)
    await Bun.write(path.join(deepDir, "schema.prisma"), "model User {}")
    const result = await LSPServer.Prisma.root(path.join(deepDir, "schema.prisma"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(deepDir)
  })

  test("TexLab root finds .texlabroot", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "docs")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, ".texlabroot"), "")
    const result = await LSPServer.TexLab.root(path.join(deepDir, "main.tex"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("PHPIntelephense root finds composer.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "composer.json"), "{}")
    const result = await LSPServer.PHPIntelephense.root(path.join(deepDir, "index.php"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Zls root finds build.zig", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "build.zig"), "")
    const result = await LSPServer.Zls.root(path.join(deepDir, "main.zig"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Rubocop root finds Gemfile", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "app")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "Gemfile"), "")
    const result = await LSPServer.Rubocop.root(path.join(deepDir, "app.rb"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Astro root finds package-lock.json", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "package-lock.json"), "{}")
    const result = await LSPServer.Astro.root(path.join(deepDir, "page.astro"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("KotlinLS root finds build.gradle.kts", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "app")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "build.gradle.kts"), "")
    const result = await LSPServer.KotlinLS.root(path.join(deepDir, "Main.kt"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("CSharp root finds .sln file", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "app.sln"), "")
    const result = await LSPServer.CSharp.root(path.join(deepDir, "Program.cs"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Razor root finds .sln file", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "app.sln"), "")
    const result = await LSPServer.Razor.root(path.join(deepDir, "Page.razor"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("FSharp root finds .sln file", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "src")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "app.sln"), "")
    const result = await LSPServer.FSharp.root(path.join(deepDir, "Program.fs"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("SourceKit root finds Package.swift", async () => {
    await using tmp = await tmpdir()
    const deepDir = path.join(tmp.path, "Sources")
    await mk(deepDir)
    await Bun.write(path.join(tmp.path, "Package.swift"), "")
    const result = await LSPServer.SourceKit.root(path.join(deepDir, "main.swift"), {
      directory: tmp.path,
      worktree: tmp.path,
    } as any)
    expect(result).toBe(tmp.path)
  })

  test("Language server extensions match expected values", () => {
    expect(LSPServer.Typescript.extensions).toContain(".ts")
    expect(LSPServer.Typescript.extensions).toContain(".tsx")
    expect(LSPServer.Typescript.extensions).toContain(".js")
    expect(LSPServer.Vue.extensions).toContain(".vue")
    expect(LSPServer.Pyright.extensions).toContain(".py")
    expect(LSPServer.Gopls.extensions).toContain(".go")
    expect(LSPServer.RustAnalyzer.extensions).toContain(".rs")
    expect(LSPServer.Deno.extensions).toContain(".ts")
    expect(LSPServer.ElixirLS.extensions).toContain(".ex")
    expect(LSPServer.Clangd.extensions).toContain(".cpp")
    expect(LSPServer.PHPIntelephense.extensions).toContain(".php")
  })

  test("Ty extension list matches Python files", () => {
    expect(LSPServer.Ty.extensions).toContain(".py")
    expect(LSPServer.Ty.extensions).toContain(".pyi")
  })

  test("CSharp extension list matches C# files", () => {
    expect(LSPServer.CSharp.extensions).toContain(".cs")
    expect(LSPServer.CSharp.extensions).toContain(".csx")
  })

  test("Razor extension list matches Razor files", () => {
    expect(LSPServer.Razor.extensions).toContain(".razor")
    expect(LSPServer.Razor.extensions).toContain(".cshtml")
  })

  test("FSharp extension list matches F# files", () => {
    expect(LSPServer.FSharp.extensions).toContain(".fs")
    expect(LSPServer.FSharp.extensions).toContain(".fsi")
    expect(LSPServer.FSharp.extensions).toContain(".fsx")
  })

  test("SourceKit extension list matches Swift files", () => {
    expect(LSPServer.SourceKit.extensions).toContain(".swift")
  })

  test("Oxlint extension list covers many file types", () => {
    expect(LSPServer.Oxlint.extensions).toContain(".ts")
    expect(LSPServer.Oxlint.extensions).toContain(".js")
    expect(LSPServer.Oxlint.extensions).toContain(".vue")
    expect(LSPServer.Oxlint.extensions).toContain(".svelte")
    expect(LSPServer.Oxlint.extensions).toContain(".astro")
  })

  test("Biome extension list covers JSON and more", () => {
    expect(LSPServer.Biome.extensions).toContain(".json")
    expect(LSPServer.Biome.extensions).toContain(".vue")
    expect(LSPServer.Biome.extensions).toContain(".css")
    expect(LSPServer.Biome.extensions).toContain(".graphql")
  })

  test("KotlinLS extension list covers Kotlin files", () => {
    expect(LSPServer.KotlinLS.extensions).toContain(".kt")
    expect(LSPServer.KotlinLS.extensions).toContain(".kts")
  })

  test("Clangd extension list covers C/C++ variants", () => {
    expect(LSPServer.Clangd.extensions).toContain(".c")
    expect(LSPServer.Clangd.extensions).toContain(".cpp")
    expect(LSPServer.Clangd.extensions).toContain(".h")
    expect(LSPServer.Clangd.extensions).toContain(".hxx")
  })

  test("SourceKit handles multiple extensions", () => {
    expect(LSPServer.SourceKit.extensions).toContain(".swift")
    expect(LSPServer.SourceKit.extensions).toContain(".objc")
  })
})
