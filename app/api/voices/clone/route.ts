import type { cloneVoiceTask } from "@/src/trigger/voice-cloning"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  buildVoiceSampleObjectKey,
  defaultDeepgramVoices,
  type VoiceRecord,
} from "@/lib/voices"
import {
  VOICE_CLONING_CREDITS,
  assertHasCredits,
  debitCredits,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const formData = await request.formData()
  const name = formData.get("name")
  const sample = formData.get("sample")
  const consent = formData.get("consent")

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Enter a name for the cloned voice." },
      { status: 400 }
    )
  }

  if (consent !== "true") {
    return NextResponse.json(
      { error: "Confirm you have permission to clone this voice." },
      { status: 400 }
    )
  }

  if (!(sample instanceof File)) {
    return NextResponse.json(
      { error: "Upload a 10-second voice sample." },
      { status: 400 }
    )
  }

  if (!sample.type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "Voice sample must be an audio file." },
      { status: 400 }
    )
  }

  try {
    await assertHasCredits(
      client,
      user.id,
      VOICE_CLONING_CREDITS,
      "Not enough credits for this voice cloning request."
    )
  } catch (creditError) {
    return NextResponse.json(
      {
        error:
          creditError instanceof Error
            ? creditError.message
            : "Not enough credits for this voice cloning request.",
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

  const voiceId = crypto.randomUUID()
  const objectKey = buildVoiceSampleObjectKey(user.id, voiceId, sample.name)
  const bucket = client.storage.from("avatars")
  const { error: uploadError } = await bucket.upload(objectKey, sample)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const sampleUrl = bucket.getPublicUrl(objectKey)
  const avatarImage =
    defaultDeepgramVoices[Math.floor(Math.random() * defaultDeepgramVoices.length)]
      ?.avatar ?? "/avatars/emma.png"
  const { data: voice, error: insertError } = await client.database
    .from("voice_clones")
    .insert({
      id: voiceId,
      user_id: user.id,
      name: name.trim(),
      voice_type: "custom",
      sample_url: sampleUrl,
      avatar_image: avatarImage,
      status: "queued",
      is_selected: false,
    })
    .select("*")
    .single()

  if (insertError || !voice) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to save voice clone." },
      { status: 500 }
    )
  }

  const handle = await tasks.trigger<typeof cloneVoiceTask>(
    "clone-voice",
    {
      voiceId,
      userId: user.id,
      sampleUrl,
      creditsCharged: VOICE_CLONING_CREDITS,
    },
    {
      tags: [`user:${user.id}`, `voice:${voiceId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  await client.database
    .from("voice_clones")
    .update({ trigger_run_id: handle.id })
    .eq("id", voiceId)
    .eq("user_id", user.id)

  const debitedCredits = await debitCredits({
    client,
    userId: user.id,
    credits: VOICE_CLONING_CREDITS,
    description: `Voice cloning request: ${name.trim()}`,
    referenceId: voiceId,
  })

  return NextResponse.json({
    voice: { ...(voice as VoiceRecord), trigger_run_id: handle.id },
    voiceId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits: VOICE_CLONING_CREDITS,
    balance: debitedCredits.balance,
  })
}

export async function DELETE(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { voiceId } = (await request.json()) as { voiceId?: string }

  if (!voiceId) {
    return NextResponse.json(
      { error: "Missing voice clone id." },
      { status: 400 }
    )
  }

  const { error: deleteError } = await client.database
    .from("voice_clones")
    .delete()
    .eq("id", voiceId)
    .eq("user_id", user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
