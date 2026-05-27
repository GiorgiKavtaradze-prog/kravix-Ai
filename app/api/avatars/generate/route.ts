import type { generateAvatarTask } from "@/src/trigger/generate-avatar"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import { avatarStyles, type AvatarStyle } from "@/lib/avatars"

export async function POST(request: Request) {
  const {
    avatarId,
    userId,
    sourceImageUrl,
    style,
    prompt,
  } = (await request.json()) as {
    avatarId?: string
    userId?: string
    sourceImageUrl?: string
    style?: string
    prompt?: string | null
  }

  if (typeof style !== "string" || !avatarStyles.includes(style as AvatarStyle)) {
    return NextResponse.json(
      { error: "Select a valid avatar style." },
      { status: 400 }
    )
  }

  if (!avatarId || !userId || !sourceImageUrl) {
    return NextResponse.json(
      { error: "Missing avatar generation details." },
      { status: 400 }
    )
  }

  const avatarStyle = style as AvatarStyle
  const trimmedPrompt =
    typeof prompt === "string" && prompt.trim() ? prompt.trim() : null

  const handle = await tasks.trigger<typeof generateAvatarTask>(
    "generate-avatar",
    {
      avatarId,
      userId,
      sourceImageUrl,
      style: avatarStyle,
      prompt: trimmedPrompt,
    },
    {
      tags: [`user:${userId}`, `avatar:${avatarId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  return NextResponse.json({
    avatarId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
  })
}
