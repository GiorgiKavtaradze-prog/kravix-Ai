import type { generateAvatarVideoTask } from "@/src/trigger/generate-avatar-video"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS,
  calculateAvatarVideoCredits,
  getAvatarImageForRatio,
  isAvatarVideoDuration,
  isAvatarVideoRatio,
  isScriptTone,
  type AvatarVideoRecord,
  type ScriptTone,
} from "@/lib/avatar-videos"
import type { AvatarRecord } from "@/lib/avatars"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"
import {
  STARTING_VOICE_CREDITS,
  defaultDeepgramVoices,
  getDefaultVoice,
  type CreditBalance,
  type VoiceRecord,
  type VoiceType,
} from "@/lib/voices"

async function ensureCreditBalance(
  client: NonNullable<Awaited<ReturnType<typeof getAuthenticatedInsForgeClient>>["client"]>,
  userId: string
) {
  const { data, error } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (!error && data) {
    return data as CreditBalance
  }

  const { data: created, error: insertError } = await client.database
    .from("user_credits")
    .insert({
      user_id: userId,
      balance: STARTING_VOICE_CREDITS,
    })
    .select("*")
    .single()

  if (insertError) {
    // If the insert failed (e.g. unique key violation from concurrent request), try to fetch the credit row again.
    const { data: retryData, error: retryError } = await client.database
      .from("user_credits")
      .select("*")
      .eq("user_id", userId)
      .single()

    if (!retryError && retryData) {
      return retryData as CreditBalance
    }

    throw new Error(insertError.message ?? "Unable to create credit balance.")
  }

  if (!created) {
    throw new Error("Unable to create credit balance.")
  }

  return created as CreditBalance
}

export async function GET(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const [credits, videosResult, avatarsResult, voicesResult] = await Promise.all([
      ensureCreditBalance(client, user.id),
      client.database
        .from("avatar_videos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      client.database
        .from("avatars")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      client.database
        .from("voice_clones")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])

    if (videosResult.error) {
      throw new Error(videosResult.error.message)
    }

    if (avatarsResult.error) {
      throw new Error(avatarsResult.error.message)
    }

    if (voicesResult.error) {
      throw new Error(voicesResult.error.message)
    }

    return NextResponse.json({
      videos: (videosResult.data ?? []) as AvatarVideoRecord[],
      avatars: (avatarsResult.data ?? []) as AvatarRecord[],
      customVoices: (voicesResult.data ?? []) as VoiceRecord[],
      defaultVoices: defaultDeepgramVoices,
      credits,
    })
  } catch (fetchError) {
    return NextResponse.json(
      {
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load avatar videos.",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const body = (await request.json()) as {
    title?: string
    script?: string
    scriptMode?: "manual" | "ai"
    scriptTopic?: string
    scriptTone?: ScriptTone
    avatarId?: string
    voiceId?: string
    voiceType?: VoiceType
    durationSeconds?: number
    screenRatio?: string
  }
  const title = body.title?.trim() || "Untitled avatar video"
  const script = body.script?.trim() ?? ""
  const scriptMode = body.scriptMode === "ai" ? "ai" : "manual"

  if (!script) {
    return NextResponse.json({ error: "Enter a script for the video." }, { status: 400 })
  }

  if (script.length > AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS) {
    return NextResponse.json(
      { error: "Script must be 2,000 characters or fewer." },
      { status: 400 }
    )
  }

  if (!body.avatarId) {
    return NextResponse.json({ error: "Choose an avatar." }, { status: 400 })
  }

  if (!body.voiceId || (body.voiceType !== "custom" && body.voiceType !== "default")) {
    return NextResponse.json({ error: "Choose a voice." }, { status: 400 })
  }

  if (!isAvatarVideoDuration(body.durationSeconds)) {
    return NextResponse.json({ error: "Choose a valid duration." }, { status: 400 })
  }

  if (!isAvatarVideoRatio(body.screenRatio)) {
    return NextResponse.json({ error: "Choose a valid screen size." }, { status: 400 })
  }

  if (body.scriptTone && !isScriptTone(body.scriptTone)) {
    return NextResponse.json({ error: "Choose a valid script tone." }, { status: 400 })
  }

  const { data: avatar, error: avatarError } = await client.database
    .from("avatars")
    .select("*")
    .eq("id", body.avatarId)
    .eq("user_id", user.id)
    .single()

  if (avatarError || !avatar) {
    return NextResponse.json({ error: "Choose a saved avatar." }, { status: 400 })
  }

  const avatarRecord = avatar as AvatarRecord
  const avatarImageUrl = getAvatarImageForRatio(avatarRecord, body.screenRatio)

  if (!avatarImageUrl) {
    return NextResponse.json(
      { error: "The selected avatar does not have a usable image." },
      { status: 400 }
    )
  }

  let voiceName: string

  if (body.voiceType === "default") {
    const defaultVoice = getDefaultVoice(body.voiceId)

    if (!defaultVoice) {
      return NextResponse.json({ error: "Choose a valid default voice." }, { status: 400 })
    }

    voiceName = defaultVoice.name
  } else {
    const { data: customVoice, error: voiceError } = await client.database
      .from("voice_clones")
      .select("*")
      .eq("id", body.voiceId)
      .eq("user_id", user.id)
      .single()

    if (voiceError || !customVoice || customVoice.status !== "completed") {
      return NextResponse.json({ error: "Choose a ready custom voice." }, { status: 400 })
    }

    voiceName = String(customVoice.name)
  }

  const credits = calculateAvatarVideoCredits(body.durationSeconds)
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (creditError || !creditRow) {
    return NextResponse.json(
      { error: "Credit balance is not ready. Refresh and try again." },
      { status: 400 }
    )
  }

  const currentBalance = Number(creditRow.balance ?? 0)

  if (currentBalance < credits) {
    return NextResponse.json(
      { error: "Not enough credits for this avatar video." },
      { status: 402 }
    )
  }

  const videoId = crypto.randomUUID()
  const { data: video, error: insertError } = await client.database
    .from("avatar_videos")
    .insert({
      id: videoId,
      user_id: user.id,
      title,
      script,
      script_mode: scriptMode,
      script_topic: body.scriptTopic?.trim() || null,
      script_tone: body.scriptTone ?? null,
      avatar_id: body.avatarId,
      avatar_name: avatarRecord.name,
      avatar_style: avatarRecord.style,
      avatar_image_url: avatarImageUrl,
      voice_id: body.voiceId,
      voice_type: body.voiceType,
      voice_name: voiceName,
      duration_seconds: body.durationSeconds,
      screen_ratio: body.screenRatio,
      credits_charged: credits,
      thumbnail_url: avatarImageUrl,
      status: "queued",
    })
    .select("*")
    .single()

  if (insertError || !video) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to save avatar video request." },
      { status: 500 }
    )
  }

  const { data: debitedCredits, error: debitError } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance - credits })
    .eq("user_id", user.id)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (debitError || !debitedCredits) {
    await client.database
      .from("avatar_videos")
      .update({
        status: "failed",
        error_message: "Unable to deduct credits. Try again.",
      })
      .eq("id", videoId)
      .eq("user_id", user.id)

    return NextResponse.json(
      { error: debitError?.message ?? "Unable to deduct credits. Try again." },
      { status: 409 }
    )
  }

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    amount: -credits,
    type: "debit",
    description: `Avatar video generation: ${title}`,
    reference_id: videoId,
  })

  const handle = await tasks.trigger<typeof generateAvatarVideoTask>(
    "generate-avatar-video",
    {
      videoId,
      userId: user.id,
      creditsCharged: credits,
    },
    {
      tags: [`user:${user.id}`, `avatar-video:${videoId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  await client.database
    .from("avatar_videos")
    .update({ trigger_run_id: handle.id })
    .eq("id", videoId)
    .eq("user_id", user.id)

  return NextResponse.json({
    video: {
      ...(video as AvatarVideoRecord),
      trigger_run_id: handle.id,
    },
    videoId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits,
    balance: Number(debitedCredits.balance ?? currentBalance - credits),
  })
}
