import { NextResponse } from "next/server"

import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"
import { buildUserProfilePayload, type UserProfile } from "@/lib/users"

export async function GET(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { data, error: queryError } = await client.database
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  return NextResponse.json({ user: data as UserProfile | null })
}

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  let payload: ReturnType<typeof buildUserProfilePayload>

  try {
    payload = buildUserProfilePayload(user)
  } catch (payloadError) {
    return NextResponse.json(
      {
        error:
          payloadError instanceof Error
            ? payloadError.message
            : "Unable to read user profile.",
      },
      { status: 400 }
    )
  }

  const { data, error: upsertError } = await client.database
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single()

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ user: data as UserProfile })
}
