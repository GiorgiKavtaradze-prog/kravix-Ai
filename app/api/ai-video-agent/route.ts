import type { generateAiVideoAgentTask } from "@/src/trigger/generate-ai-video-agent"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS,
  calculateAiVideoAgentCredits,
  getAvatarImageForAiVideo,
  isAiVideoAgentBrollStyle,
  isAiVideoAgentCaptionStyle,
  isAiVideoAgentDuration,
  isAiVideoAgentScreenSize,
  type AiVideoAgentScriptMode,
  type AiVideoProjectRecord,
} from "@/lib/ai-video-agent"
import { defaultAvatars, type AvatarRecord } from "@/lib/avatars"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"
import {
  STARTING_VOICE_CREDITS,
  defaultDeepgramVoices,
  getDefaultVoice,
  type CreditBalance,
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

async function ensureCreditBalance(
  client: NonNullable<Awaited<ReturnType<typeof getAuthenticatedInsForgeClient>>["client"]>,
  userId: string
) {
  const { data, error } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (!error && data) return data as CreditBalance

  const { data: created, error: insertError } = await client.database
    .from("user_credits")
    .insert({
      user_id: userId,
      balance: STARTING_VOICE_CREDITS,
    })
    .select("*")
    .single()

  if (insertError) {
    const { data: retryData, error: retryError } = await client.database
      .from("user_credits")
      .select("*")
      .eq("user_id", userId)
      .single()

    if (!retryError && retryData) return retryData as CreditBalance
    throw new Error(insertError.message ?? "Unable to create credit balance.")
  }

  if (!created) throw new Error("Unable to create credit balance.")
  return created as CreditBalance
}

export async function GET(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const [credits, projectsResult, avatarsResult, voicesResult] = await Promise.all([
      ensureCreditBalance(client, user.id),
      client.database
        .from("ai_video_projects")
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

    if (projectsResult.error) throw new Error(projectsResult.error.message)
    if (avatarsResult.error) throw new Error(avatarsResult.error.message)
    if (voicesResult.error) throw new Error(voicesResult.error.message)

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
      projects: (projectsResult.data ?? []) as AiVideoProjectRecord[],
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
            : "Unable to load AI Video Agent projects.",
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
    scriptMode?: AiVideoAgentScriptMode
    scriptTopic?: string
    durationSeconds?: number
    screenSize?: string
    avatarId?: string
    voiceId?: string
    voiceType?: VoiceType
    captionStyle?: string
    brollStyle?: string
  }
  const title = body.title?.trim() || "Untitled AI video"
  const script = body.script?.trim() ?? ""
  const scriptMode = body.scriptMode === "topic" ? "topic" : "manual"
  const scriptTopic = body.scriptTopic?.trim() ?? ""

  if (scriptMode === "manual" && !script) {
    return NextResponse.json({ error: "Enter a script." }, { status: 400 })
  }

  if (scriptMode === "topic" && !scriptTopic && !script) {
    return NextResponse.json({ error: "Enter a topic for AI script generation." }, { status: 400 })
  }

  if (script.length > AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS) {
    return NextResponse.json(
      { error: "Script must be 8,000 characters or fewer." },
      { status: 400 }
    )
  }

  if (!body.avatarId) {
    return NextResponse.json({ error: "Choose an avatar." }, { status: 400 })
  }

  if (!body.voiceId || (body.voiceType !== "custom" && body.voiceType !== "default")) {
    return NextResponse.json({ error: "Choose a voice." }, { status: 400 })
  }

  if (!isAiVideoAgentDuration(body.durationSeconds)) {
    return NextResponse.json({ error: "Choose a valid duration." }, { status: 400 })
  }

  if (!isAiVideoAgentScreenSize(body.screenSize)) {
    return NextResponse.json({ error: "Choose a valid screen size." }, { status: 400 })
  }

  if (!isAiVideoAgentCaptionStyle(body.captionStyle)) {
    return NextResponse.json({ error: "Choose a valid caption design." }, { status: 400 })
  }

  if (!isAiVideoAgentBrollStyle(body.brollStyle)) {
    return NextResponse.json({ error: "Choose a valid B-roll style." }, { status: 400 })
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

  const avatarImageUrl = getAvatarImageForAiVideo(avatarRecord, body.screenSize)

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

  const credits = calculateAiVideoAgentCredits({
    duration: body.durationSeconds,
    brollStyle: body.brollStyle,
  })
  const creditRow = await ensureCreditBalance(client, user.id)
  const currentBalance = Number(creditRow.balance ?? 0)

  if (currentBalance < credits) {
    return NextResponse.json(
      { error: "Not enough credits for this AI video." },
      { status: 402 }
    )
  }

  const projectId = crypto.randomUUID()
  const { data: project, error: insertError } = await client.database
    .from("ai_video_projects")
    .insert({
      id: projectId,
      user_id: user.id,
      title,
      script,
      script_mode: scriptMode,
      script_topic: scriptMode === "topic" ? scriptTopic : null,
      duration_seconds: body.durationSeconds,
      screen_size: body.screenSize,
      avatar_id: avatarRecord.id,
      avatar_name: avatarRecord.name,
      avatar_style: avatarRecord.style,
      avatar_image_url: avatarImageUrl,
      voice_id: body.voiceId,
      voice_type: body.voiceType,
      voice_name: voiceName,
      caption_style: body.captionStyle,
      broll_style: body.brollStyle,
      credits_charged: credits,
      status: "queued",
      progress: 0,
      progress_stage: "queued",
      thumbnail_url: avatarImageUrl,
    })
    .select("*")
    .single()

  if (insertError || !project) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to save AI video project." },
      { status: 500 }
    )
  }

  if (credits > 0) {
    const { data: debitedCredits, error: debitError } = await client.database
      .from("user_credits")
      .update({ balance: currentBalance - credits })
      .eq("user_id", user.id)
      .eq("balance", currentBalance)
      .select("*")
      .single()

    if (debitError || !debitedCredits) {
      await client.database
        .from("ai_video_projects")
        .update({
          status: "failed",
          error_message: "Unable to deduct credits. Try again.",
        })
        .eq("id", projectId)
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
      description: `AI Video Agent generation: ${title}`,
      reference_id: projectId,
    })
  }

  const handle = await tasks.trigger<typeof generateAiVideoAgentTask>(
    "generate-ai-video-agent",
    {
      projectId,
      userId: user.id,
      creditsCharged: credits,
    },
    {
      tags: [`user:${user.id}`, `ai-video-agent:${projectId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "2hr",
      },
    }
  )

  await client.database
    .from("ai_video_projects")
    .update({ trigger_run_id: handle.id })
    .eq("id", projectId)
    .eq("user_id", user.id)

  return NextResponse.json({
    project: {
      ...(project as AiVideoProjectRecord),
      trigger_run_id: handle.id,
    },
    projectId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits,
    balance: currentBalance - credits,
  })
}
