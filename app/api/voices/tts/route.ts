import type { generateVoiceTtsTask } from "@/src/trigger/voice-cloning"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import {
  TTS_MAX_CHARACTERS,
  calculateTtsCredits,
  getDefaultVoice,
  type TtsGenerationRecord,
  type VoiceType,
} from "@/lib/voices"
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

  const credits = calculateTtsCredits(trimmedText.length)
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
      { error: "Not enough credits for this text to speech generation." },
      { status: 402 }
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

  const { data: debitedCredits, error: debitError } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance - credits })
    .eq("user_id", user.id)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (debitError || !debitedCredits) {
    await client.database
      .from("voice_tts_generations")
      .update({
        status: "failed",
        error_message: "Unable to deduct credits. Try again.",
      })
      .eq("id", generationId)
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
    description: `Voice TTS generation with ${voiceName}`,
    reference_id: generationId,
  })

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

  return NextResponse.json({
    generation: {
      ...(generation as TtsGenerationRecord),
      trigger_run_id: handle.id,
    },
    generationId,
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
    credits,
    balance: Number(debitedCredits.balance ?? currentBalance - credits),
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
