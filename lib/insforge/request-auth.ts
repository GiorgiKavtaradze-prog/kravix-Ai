import { createInsForgeServerClient } from "@/lib/insforge/server"

type AuthenticatedUser = {
  id: string
  email?: string
  [key: string]: unknown
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  )

  return Buffer.from(padded, "base64").toString("utf8")
}

function decodeTokenUserId(token: string) {
  const [, payload] = token.split(".")

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as {
      sub?: unknown
      id?: unknown
      user_id?: unknown
    }
    const value = parsed.sub ?? parsed.id ?? parsed.user_id

    return typeof value === "string" && value ? value : null
  } catch {
    return null
  }
}

export async function getAuthenticatedInsForgeClient(request: Request) {
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    return {
      client: null,
      user: null,
      error: "Missing authorization header.",
    }
  }

  const client = createInsForgeServerClient()
  client.setAccessToken(token)

  const { data, error } = await client.auth.getCurrentUser()

  if (error || !data.user) {
    const headerUserId = request.headers.get("x-insforge-user-id")
    const headerEmail = request.headers.get("x-insforge-user-email") ?? undefined
    const tokenUserId = decodeTokenUserId(token)

    if (headerUserId && tokenUserId && headerUserId === tokenUserId) {
      return {
        client,
        user: {
          id: headerUserId,
          email: headerEmail,
        } satisfies AuthenticatedUser,
        error: null,
      }
    }

    return {
      client: null,
      user: null,
      error: error?.message ?? "Unable to verify the current user.",
    }
  }

  return { client, user: data.user, error: null }
}
