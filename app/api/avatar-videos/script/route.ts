import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"

import {
  AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS,
  isScriptTone,
  type ScriptTone,
} from "@/lib/avatar-videos"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

function fallbackScript(topic: string, tone: ScriptTone) {
  return [
    `Here is a ${tone} short video script about ${topic}.`,
    "Start with a clear hook, explain the key benefit in simple language, and close with one confident call to action.",
  ].join(" ")
}

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { topic, tone } = (await request.json()) as {
    topic?: string
    tone?: ScriptTone
  }
  const trimmedTopic = topic?.trim() ?? ""

  if (!trimmedTopic) {
    return NextResponse.json(
      { error: "Enter a topic for the AI script." },
      { status: 400 }
    )
  }

  if (!isScriptTone(tone)) {
    return NextResponse.json(
      { error: "Choose a valid script tone." },
      { status: 400 }
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      script: fallbackScript(trimmedTopic, tone),
    })
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          text: [
            "Write a concise talking avatar video script.",
            `Topic: ${trimmedTopic}.`,
            `Tone: ${tone}.`,
            "Keep it natural for spoken delivery, with no markdown, scene labels, or stage directions.",
            `Stay under ${AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS} characters.`,
          ].join(" "),
        },
      ],
    })
    const script =
      response.text?.trim().slice(0, AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS) ??
      fallbackScript(trimmedTopic, tone)

    return NextResponse.json({ script })
  } catch (scriptError) {
    return NextResponse.json(
      {
        error:
          scriptError instanceof Error
            ? scriptError.message
            : "Unable to generate a script.",
      },
      { status: 500 }
    )
  }
}
