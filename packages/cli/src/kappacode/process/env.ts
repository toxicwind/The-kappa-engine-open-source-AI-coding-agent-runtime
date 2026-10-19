export function model(extra?: NodeJS.ProcessEnv | null): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...(extra ?? {}) }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
  delete env.KAPPA_SERVER_PASSWORD
  delete env.KAPPA_SERVER_USERNAME
  delete env.KAPPA_BROWSER_BROKER_URL
  delete env.KAPPA_BROWSER_BROKER_TOKEN
  delete env.KAPPA_CONFIG
  delete env.KAPPA_CONFIG_CONTENT
  delete env.KAPPA_CONFIG_DIR
  return env
}
