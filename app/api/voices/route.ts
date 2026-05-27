import { NextResponse } from "next/server"

import {
  STARTING_VOICE_CREDITS,
  defaultDeepgramVoices,
  type CreditBalance,
  type TtsGenerationRecord,
  type VoiceRecord,
} from "@/lib/voices"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

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
    const [credits, voicesResult, generationsResult] = await Promise.all([
      ensureCreditBalance(client, user.id),
      client.database
        .from("voice_clones")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      client.database
        .from("voice_tts_generations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])

    if (voicesResult.error) {
      throw new Error(voicesResult.error.message)
    }

    if (generationsResult.error) {
      throw new Error(generationsResult.error.message)
    }

    return NextResponse.json({
      customVoices: (voicesResult.data ?? []) as VoiceRecord[],
      defaultVoices: defaultDeepgramVoices,
      ttsGenerations: (generationsResult.data ?? []) as TtsGenerationRecord[],
      credits,
    })
  } catch (fetchError) {
    return NextResponse.json(
      {
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load voices.",
      },
      { status: 500 }
    )
  }
}
