export function attribute(text: string, source: string | undefined): string {
  if (!source) return text
  return `${text}\n\n<!-- kappa-agent-manager source=${source} -->`
}
