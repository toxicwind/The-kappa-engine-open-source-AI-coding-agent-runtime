export const opaque = [
  { id: "semantic_search", file: "kappacode/tool/semantic-search.ts" },
  { id: "lsp", file: "tool/lsp.ts" },
] as const

export const host = [
  { id: "notebook_execute", file: "kappacode/tool/notebook-host.ts" },
  { id: "background_process", file: "kappacode/tool/background-process.ts" },
] as const
