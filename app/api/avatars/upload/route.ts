import { NextResponse } from "next/server"

import {
  buildAvatarObjectKey,
  type AvatarRecord,
  type AvatarStyle,
} from "@/lib/avatars"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const formData = await request.formData()
  const image = formData.get("image")

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Upload an avatar image before saving." },
      { status: 400 }
    )
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Avatar upload must be an image file." },
      { status: 400 }
    )
  }

  const avatarId = crypto.randomUUID()
  const style = formData.get("style")
  const prompt = formData.get("prompt")
  const objectKey = buildAvatarObjectKey(user.id, avatarId, image.name)
  const bucket = client.storage.from("avatars")
  const { error: uploadError } = await bucket.upload(objectKey, image)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const imageUrl = bucket.getPublicUrl(objectKey)
  const { data, error: insertError } = await client.database
    .from("avatars")
    .insert({
      id: avatarId,
      user_id: user.id,
      name: image.name.replace(/\.[^.]+$/, "") || "Uploaded avatar",
      source: "upload",
      style: typeof style === "string" ? (style as AvatarStyle) : null,
      prompt: typeof prompt === "string" && prompt.trim() ? prompt.trim() : null,
      source_image_url: imageUrl,
      image_16_9_url: imageUrl,
      image_9_16_url: imageUrl,
      status: "ready",
    })
    .select("*")
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ avatar: data as AvatarRecord })
}
