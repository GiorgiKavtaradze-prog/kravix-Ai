import type { generateAvatarTask } from "@/src/trigger/generate-avatar"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"
import { avatarStyles, type AvatarStyle } from "@/lib/avatars"
import {
  AVATAR_GENERATION_CREDITS,
  assertHasCredits,
  debitCredits,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const {
    avatarId,
    sourceImageUrl,
    style,
    prompt,
  } = (await request.json()) as {
    avatarId?: string
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

  if (!avatarId || !sourceImageUrl) {
    return NextResponse.json(
      { error: "Missing avatar generation details." },
      { status: 400 }
    )
  }

  const avatarStyle = style as AvatarStyle
  const trimmedPrompt =
    typeof prompt === "string" && prompt.trim() ? prompt.trim() : null

  try {
    await assertHasCredits(
      client,
      user.id,
      AVATAR_GENERATION_CREDITS,
      "Not enough credits for this avatar generation."
    )
  } catch (creditError) {
    return NextResponse.json(
      {
        error:
          creditError instanceof Error
            ? creditError.message
            : "Not enough credits for this avatar generation.",
      },
      { status: creditError instanceof Error && creditError.name === "InsufficientCreditsError" ? 402 : 409 }
    )
  }

  const handle = await tasks.trigger<typeof generateAvatarTask>(
    "generate-avatar",
    {
      avatarId,
      userId: user.id,
      sourceImageUrl,
      style: avatarStyle,
      prompt: trimmedPrompt,
      creditsCharged: AVATAR_GENERATION_CREDITS,
    },
    {
      tags: [`user:${user.id}`, `avatar:${avatarId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  const debitedCredits = await debitCredits({
    client,
    userId: user.id,
    credits: AVATAR_GENERATION_CREDITS,
    description: "AI avatar generation",
    referenceId: avatarId,
  })

  return NextResponse.json({
    avatarId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits: AVATAR_GENERATION_CREDITS,
    balance: debitedCredits.balance,
  })
}
