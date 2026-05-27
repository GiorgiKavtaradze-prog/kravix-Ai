"use client"

import { insforge } from "@/lib/insforge/client"

export function getInsForgeAuthHeaders(): Record<string, string> {
  const headers = insforge.getHttpClient().getHeaders()
  const authHeader = headers.Authorization ?? headers.authorization

  return typeof authHeader === "string" ? { Authorization: authHeader } : {}
}
