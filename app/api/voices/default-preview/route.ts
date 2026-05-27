import { NextResponse } from "next/server"

import { getDefaultVoice } from "@/lib/voices"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(request: Request) {
  const { error } = await getAuthenticatedInsForgeClient(request)

  if (error) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { voiceId } = (await request.json()) as { voiceId?: string }
  const voice = voiceId ? getDefaultVoice(voiceId) : null

  if (!voice) {
    return NextResponse.json(
      { error: "Choose a valid default voice." },
      { status: 400 }
    )
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY." },
      { status: 500 }
    )
  }

  const url = new URL("https://api.deepgram.com/v1/speak")
  url.searchParams.set("model", voice.model)
  url.searchParams.set("encoding", "mp3")

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: voice.previewText }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")

    return NextResponse.json(
      { error: details || "Unable to generate Deepgram preview." },
      { status: 502 }
    )
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=300",
    },
  })
}
