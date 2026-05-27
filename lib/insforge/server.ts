import { createClient } from "@insforge/sdk"

function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback

  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

export function createInsForgeServerClient() {
  const baseUrl = requiredEnv(
    "INSFORGE_URL",
    process.env.NEXT_PUBLIC_INSFORGE_URL
  )
  const anonKey = requiredEnv(
    "INSFORGE_ANON_KEY",
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY
  )
  const edgeFunctionToken =
    process.env.INSFORGE_SERVICE_ROLE_KEY ??
    process.env.INSFORGE_EDGE_FUNCTION_TOKEN

  return createClient({
    baseUrl,
    anonKey,
    edgeFunctionToken,
    isServerMode: Boolean(edgeFunctionToken),
  })
}
