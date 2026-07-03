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
import { defaultAvatars, type AvatarRecord } from "@/lib/avatars"
import {
  assertHasCredits,
  debitCredits,
  ensureCreditBalance,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"
import {
  defaultDeepgramVoices,
  getDefaultVoice,
  type VoiceRecord,
  type VoiceType,
} from "@/lib/voices"

function defaultAvatarRecord(avatarId: string, userId: string) {
  const avatar = defaultAvatars.find((item) => item.id === avatarId)

  if (!avatar) return null

  return {
    id: avatar.id,
    user_id: userId,
    name: avatar.name,
    source: "default",
    style: avatar.style,
    prompt: null,
    source_image_url: avatar.image,
    image_16_9_url: avatar.image,
    image_9_16_url: avatar.image,
    trigger_run_id: null,
    status: "ready",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  } satisfies AvatarRecord
}

async function resolveAvatar(
  client: NonNullable<Awaited<ReturnType<typeof getAuthenticatedInsForgeClient>>["client"]>,
  avatarId: string,
  userId: string
) {
  const { data: avatar, error: avatarError } = await client.database
    .from("avatars")
    .select("*")
    .eq("id", avatarId)
    .eq("user_id", userId)
    .single()

  if (!avatarError && avatar) return avatar as AvatarRecord

  const defaultAvatar = defaultAvatars.find((item) => item.id === avatarId)

  if (!defaultAvatar) return null

  const { data: savedAvatar, error: insertError } = await client.database
    .from("avatars")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
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

  if (insertError || !savedAvatar) {
    throw new Error(insertError?.message ?? "Unable to save the default avatar.")
  }

  return savedAvatar as AvatarRecord
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

    const savedAvatars = (avatarsResult.data ?? []) as AvatarRecord[]
    const missingDefaultAvatars = defaultAvatars
      .filter(
        (defaultAvatar) =>
          !savedAvatars.some(
            (avatar) =>
              avatar.source === "default" &&
              (avatar.name === defaultAvatar.name ||
                avatar.source_image_url === defaultAvatar.image)
          )
      )
      .map((avatar) => defaultAvatarRecord(avatar.id, user.id))
      .filter(Boolean) as AvatarRecord[]

    return NextResponse.json({
      videos: (videosResult.data ?? []) as AvatarVideoRecord[],
      avatars: [...savedAvatars, ...missingDefaultAvatars],
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

  let avatarRecord: AvatarRecord | null

  try {
    avatarRecord = await resolveAvatar(client, body.avatarId, user.id)
  } catch (resolveError) {
    return NextResponse.json(
      {
        error:
          resolveError instanceof Error
            ? resolveError.message
            : "Unable to save the selected avatar.",
      },
      { status: 500 }
    )
  }

  if (!avatarRecord) {
    return NextResponse.json({ error: "Choose a saved avatar." }, { status: 400 })
  }

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
  try {
    await assertHasCredits(
      client,
      user.id,
      credits,
      "Not enough credits for this avatar video."
    )
  } catch (creditError) {
    return NextResponse.json(
      {
        error:
          creditError instanceof Error
            ? creditError.message
            : "Not enough credits for this avatar video.",
      },
      {
        status:
          creditError instanceof Error &&
          creditError.name === "InsufficientCreditsError"
            ? 402
            : 409,
      }
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
      avatar_id: avatarRecord.id,
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

  const debitedCredits = await debitCredits({
    client,
    userId: user.id,
    credits,
    description: `Avatar video generation: ${title}`,
    referenceId: videoId,
  })

  return NextResponse.json({
    video: {
      ...(video as AvatarVideoRecord),
      trigger_run_id: handle.id,
    },
    videoId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits,
    balance: Number(debitedCredits.balance),
  })
}
