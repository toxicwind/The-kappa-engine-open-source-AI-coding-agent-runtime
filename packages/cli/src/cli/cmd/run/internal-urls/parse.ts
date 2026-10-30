// kilocode_change - new file
/**
 * Parse an internal URL into its components.
 */
import type { InternalUrl } from "./types"

export function parseInternalUrl(input: string): InternalUrl {
  const url = new URL(input)
  return {
    ...url,
    rawHost: url.hostname,
    rawPathname: url.pathname,
    rawHref: input,
  }
}

export function extractUriScheme(input: string): string | undefined {
  const match = input.match(/^([a-z][a-z0-9+.-]*):\/\//i)
  return match ? match[1].toLowerCase() : undefined
}

export function protocolFor(input: string): string | undefined {
  return extractUriScheme(input)
}