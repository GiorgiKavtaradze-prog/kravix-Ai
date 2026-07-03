import { NextResponse } from "next/server"
import { defaultAvatars, type AvatarRecord } from "@/lib/avatars"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { avatarId } = (await request.json()) as { avatarId?: string }
  const defaultAvatar = defaultAvatars.find((avatar) => avatar.id === avatarId)

  if (!defaultAvatar) {
    return NextResponse.json(
      { error: "Choose a valid default avatar." },
      { status: 400 }
    )
  }

  const { data, error: insertError } = await client.database
    .from("avatars")
    .insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      name: defaultAvatar.name,
      source: "default",
      style: defaultAvatar.style,
      source_image_url: defaultAvatar.image,
      image_16_9_url: defaultAvatar.image,
      image_9_16_url: defaultAvatar.image,
      status: "ready",
    })
    .select("*")
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ avatar: data as AvatarRecord })
}
