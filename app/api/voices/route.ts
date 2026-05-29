import { NextResponse } from "next/server"

import {
  defaultDeepgramVoices,
  type TtsGenerationRecord,
  type VoiceRecord,
} from "@/lib/voices"
import { ensureCreditBalance } from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

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
