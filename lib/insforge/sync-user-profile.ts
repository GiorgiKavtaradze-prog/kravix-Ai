"use client"

import { insforge } from "@/lib/insforge/client"
import { buildUserProfilePayload, type UserProfile } from "@/lib/users"

export async function syncCurrentUserProfile() {
  const { data: authData, error: authError } =
    await insforge.auth.getCurrentUser()

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Unable to verify the current user.")
  }

  const payload = buildUserProfilePayload(authData.user)
  const { data, error } = await insforge.database
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save user profile.")
  }

  return data as UserProfile
}

export async function getCurrentUserProfile() {
  const { data: authData, error: authError } =
    await insforge.auth.getCurrentUser()

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Unable to verify the current user.")
  }

  const { data, error } = await insforge.database
    .from("users")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as UserProfile | null
}
