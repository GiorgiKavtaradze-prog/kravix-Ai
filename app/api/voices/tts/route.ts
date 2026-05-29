import type { generateVoiceTtsTask } from "@/src/trigger/voice-cloning"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  TTS_MAX_CHARACTERS,
  getDefaultVoice,
  type TtsGenerationRecord,
  type VoiceType,
} from "@/lib/voices"
import {
  assertHasCredits,
  calculateTtsCreditsForText,
  debitCredits,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const {
    voiceId,
    voiceType,
    text,
  } = (await request.json()) as {
    voiceId?: string
    voiceType?: VoiceType
    text?: string
  }
  const trimmedText = typeof text === "string" ? text.trim() : ""

  if (!voiceId || (voiceType !== "custom" && voiceType !== "default")) {
    return NextResponse.json(
      { error: "Choose a voice for text to speech." },
      { status: 400 }
    )
  }

  if (!trimmedText) {
    return NextResponse.json(
      { error: "Enter text for speech generation." },
      { status: 400 }
    )
  }

  if (trimmedText.length > TTS_MAX_CHARACTERS) {
    return NextResponse.json(
      { error: "Text must be 2,000 characters or fewer." },
      { status: 400 }
    )
  }

  let voiceName: string

  if (voiceType === "default") {
    const defaultVoice = getDefaultVoice(voiceId)

    if (!defaultVoice) {
      return NextResponse.json(
        { error: "Choose a valid default voice." },
        { status: 400 }
      )
    }

    voiceName = defaultVoice.name
  } else {
    const { data: customVoice, error: voiceError } = await client.database
      .from("voice_clones")
      .select("*")
      .eq("id", voiceId)
      .eq("user_id", user.id)
      .single()

    if (voiceError || !customVoice || customVoice.status !== "completed") {
      return NextResponse.json(
        { error: "Choose a ready custom voice." },
        { status: 400 }
      )
    }

    voiceName = String(customVoice.name)
  }

  const credits = calculateTtsCreditsForText(trimmedText)
  try {
    await assertHasCredits(
      client,
      user.id,
      credits,
      "Not enough credits for this text to speech generation."
    )
  } catch (creditError) {
    return NextResponse.json(
      {
        error:
          creditError instanceof Error
            ? creditError.message
            : "Not enough credits for this text to speech generation.",
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

  const generationId = crypto.randomUUID()
  const { data: generation, error: insertError } = await client.database
    .from("voice_tts_generations")
    .insert({
      id: generationId,
      user_id: user.id,
      voice_id: voiceId,
      voice_type: voiceType,
      voice_name: voiceName,
      text: trimmedText,
      character_count: trimmedText.length,
      credits_charged: credits,
      status: "queued",
    })
    .select("*")
    .single()

  if (insertError || !generation) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to save TTS request." },
      { status: 500 }
    )
  }

  const handle = await tasks.trigger<typeof generateVoiceTtsTask>(
    "generate-voice-tts",
    {
      generationId,
      userId: user.id,
      voiceId,
      voiceType,
      text: trimmedText,
      creditsCharged: credits,
    },
    {
      tags: [`user:${user.id}`, `tts:${generationId}`],
    },
    {
      publicAccessToken: {
        expirationTime: "1hr",
      },
    }
  )

  await client.database
    .from("voice_tts_generations")
    .update({ trigger_run_id: handle.id })
    .eq("id", generationId)
    .eq("user_id", user.id)

  const debitedCredits = await debitCredits({
    client,
    userId: user.id,
    credits,
    description: `Voice TTS generation with ${voiceName}`,
    referenceId: generationId,
  })

  return NextResponse.json({
    generation: {
      ...(generation as TtsGenerationRecord),
      trigger_run_id: handle.id,
    },
    generationId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits,
    balance: Number(debitedCredits.balance),
  })
}

export async function DELETE(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { generationId } = (await request.json()) as { generationId?: string }

  if (!generationId) {
    return NextResponse.json(
      { error: "Missing generated audio id." },
      { status: 400 }
    )
  }

  const { error: deleteError } = await client.database
    .from("voice_tts_generations")
    .delete()
    .eq("id", generationId)
    .eq("user_id", user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
