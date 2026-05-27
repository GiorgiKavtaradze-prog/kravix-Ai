export type UserProfile = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  providers: string[]
  email_verified: boolean
  auth_created_at: string | null
  last_sign_in_at: string | null
  last_seen_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

type AuthUser = {
  id?: string
  email?: string
  name?: string | null
  avatar_url?: string | null
  avatarUrl?: string | null
  picture?: string | null
  providers?: string[] | null
  provider?: string | null
  email_verified?: boolean | null
  emailVerified?: boolean | null
  created_at?: string | null
  createdAt?: string | null
  last_sign_in_at?: string | null
  lastSignInAt?: string | null
  user_metadata?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

function stringFromMetadata(
  metadata: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata[key]

    if (typeof value === "string" && value.trim()) {
      return value
    }
  }

  return null
}

export function buildUserProfilePayload(user: AuthUser) {
  const metadata = user.user_metadata ?? user.metadata ?? {}
  const email = user.email

  if (!user.id || !email) {
    throw new Error("Authenticated user is missing an id or email.")
  }

  const providerList = Array.isArray(user.providers)
    ? user.providers
    : user.provider
      ? [user.provider]
      : []

  return {
    id: user.id,
    email,
    name:
      user.name ??
      stringFromMetadata(metadata, ["name", "full_name", "display_name"]),
    avatar_url:
      user.avatar_url ??
      user.avatarUrl ??
      user.picture ??
      stringFromMetadata(metadata, ["avatar_url", "picture"]),
    providers: providerList,
    email_verified: Boolean(user.email_verified ?? user.emailVerified),
    auth_created_at: user.created_at ?? user.createdAt ?? null,
    last_sign_in_at: user.last_sign_in_at ?? user.lastSignInAt ?? null,
    last_seen_at: new Date().toISOString(),
    metadata,
  }
}
