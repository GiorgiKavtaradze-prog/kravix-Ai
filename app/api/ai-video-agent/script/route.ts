import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import {
  AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS,
  isAiVideoAgentDuration,
} from "@/lib/ai-video-agent"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

function fallbackScript(topic: string, duration: number) {
  return [
    `Here is a polished ${duration}-second AI video script about ${topic}.`,
    "Start with a direct hook that names the audience's problem.",
    "Explain the core idea with one vivid example and keep the language conversational.",
    "Close with a clear next step that feels confident, useful, and easy to act on.",
  ].join(" ")
}

export async function POST(request: Request) {
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { topic, durationSeconds } = (await request.json()) as {
    topic?: string
    durationSeconds?: number
  }
  const trimmedTopic = topic?.trim() ?? ""

  if (!trimmedTopic) {
    return NextResponse.json(
      { error: "Enter a topic for the AI script." },
      { status: 400 }
    )
  }

  if (!isAiVideoAgentDuration(durationSeconds)) {
    return NextResponse.json(
      { error: "Choose a valid duration." },
      { status: 400 }
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      script: fallbackScript(trimmedTopic, durationSeconds),
    })
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          text: [
            "Write a complete spoken video script for a fully edited AI video.",
            `Topic: ${trimmedTopic}.`,
            `Target duration: ${durationSeconds} seconds.`,
            "Use natural narration only. Do not include markdown, timestamps, scene labels, camera notes, or stage directions.",
            "Make the pacing suitable for voiceover, captions, avatar clips, and B-roll.",
            `Stay under ${AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS} characters.`,
          ].join(" "),
        },
      ],
    })
    const script =
      response.text?.trim().slice(0, AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS) ??
      fallbackScript(trimmedTopic, durationSeconds)

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
