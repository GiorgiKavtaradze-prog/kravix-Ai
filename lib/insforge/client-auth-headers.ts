"use client"

import { insforge } from "@/lib/insforge/client"

export async function getInsforgeAuthHeaders() {
  const { data, error } = await insforge.auth.getCurrentUser()

  if (error || !data.user) {
    throw new Error(error?.message ?? "Sign in again to continue.")
  }

  const accessToken = (
    insforge as unknown as {
      tokenManager?: { getAccessToken: () => string | null }
    }
  ).tokenManager?.getAccessToken()

  if (!accessToken) {
    throw new Error("Sign in again to continue.")
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Insforge-User-Id": data.user.id,
    ...(data.user.email
      ? {
          "X-Insforge-User-Email": data.user.email,
        }
      : {}),
  }
}
