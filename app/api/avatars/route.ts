import { NextResponse } from "next/server"

import type { AvatarRecord } from "@/lib/avatars"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function GET(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { data, error: queryError } = await client.database
    .from("avatars")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  return NextResponse.json({ avatars: (data ?? []) as AvatarRecord[] })
}
