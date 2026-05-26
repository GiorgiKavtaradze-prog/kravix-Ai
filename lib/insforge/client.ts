"use client"

import { createClient } from "@insforge/sdk"

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY

if (!baseUrl) {
  throw new Error("Missing NEXT_PUBLIC_INSFORGE_URL")
}

if (!anonKey) {
  throw new Error("Missing NEXT_PUBLIC_INSFORGE_ANON_KEY")
}

export const insforge = createClient({
  baseUrl,
  anonKey,
})
