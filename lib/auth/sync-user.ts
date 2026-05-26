"use client"

import { insforge } from "@/lib/insforge/client"

export type AuthUser = {
  id: string
  email?: string | null
  emailVerified?: boolean | null
  email_verified?: boolean | null
  providers?: string[] | null
  createdAt?: string | null
  created_at?: string | null
  profile?: {
    name?: string | null
    avatar_url?: string | null
    avatarUrl?: string | null
  } | null
  metadata?: Record<string, unknown> | null
}

type SyncReason = "sign_in" | "sign_up" | "session"

export async function syncUserProfile(user: AuthUser, reason: SyncReason) {
  const now = new Date().toISOString()
  const profile = user.profile ?? {}
  const payload = {
    id: user.id,
    email: user.email ?? "",
    name: profile.name ?? null,
    avatar_url: profile.avatar_url ?? profile.avatarUrl ?? null,
    providers: user.providers ?? [],
    email_verified: Boolean(user.emailVerified ?? user.email_verified),
    auth_created_at: user.createdAt ?? user.created_at ?? null,
    last_seen_at: now,
    last_sign_in_at: reason === "session" ? undefined : now,
    metadata: {
      ...(user.metadata ?? {}),
      last_sync_reason: reason,
    },
    updated_at: now,
  }

  const { data, error } = await insforge.database
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single()

  if (error) {
    console.error("Unable to sync InsForge user profile", error)
  }

  return { data, error }
}
