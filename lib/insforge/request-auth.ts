import { createInsForgeServerClient } from "@/lib/insforge/server"

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
    return {
      client: null,
      user: null,
      error: error?.message ?? "Unable to verify the current user.",
    }
  }

  return { client, user: data.user, error: null }
}
