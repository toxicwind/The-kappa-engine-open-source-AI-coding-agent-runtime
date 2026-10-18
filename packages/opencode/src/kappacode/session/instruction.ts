import { KappacodeMarkdown } from "../config/markdown.ts"

export namespace KappacodeInstruction {
  export function content(text: string, item: string, options: KappacodeMarkdown.Options) {
    return KappacodeMarkdown.substitute(text, item, options)
  }

  export async function read(item: string, options: KappacodeMarkdown.Options) {
    return content(await KappacodeMarkdown.read(item, options), item, options)
  }
}
