import type { editAiVideoSceneAssetTask } from "@/src/trigger/edit-ai-video-agent"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"
import {
  AI_VIDEO_AGENT_IMAGE_CREDITS,
  AI_VIDEO_AGENT_VIDEO_CREDITS,
  calculateAvatarVideoCredits,
} from "@/lib/credits"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

const sceneAssetModes = ["ai_image", "ai_video", "stock", "illustration", "avatar_video"] as const

type SceneAssetMode = (typeof sceneAssetModes)[number]

function isSceneAssetMode(value: unknown): value is SceneAssetMode {
  return typeof value === "string" && sceneAssetModes.includes(value as SceneAssetMode)
}

function aiVideoClipSeconds(scene: { start_time?: number; end_time?: number }) {
  const duration = Math.max(1, Number(scene.end_time ?? 0) - Number(scene.start_time ?? 0))
  return duration <= 5 ? 5 : 10
}

function aiVideoClipCredits() {
  return AI_VIDEO_AGENT_VIDEO_CREDITS
}

function sceneAssetCredits(mode: SceneAssetMode, seconds: number) {
  if (mode === "ai_image" || mode === "illustration") {
    return AI_VIDEO_AGENT_IMAGE_CREDITS
  }

  if (mode === "ai_video") {
    return aiVideoClipCredits()
  }

  if (mode === "avatar_video") {
    return calculateAvatarVideoCredits(seconds)
  }

  return 0
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const { id, sceneId } = await params
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      mode?: string
      prompt?: string
    }

    if (!isSceneAssetMode(body.mode)) {
      return NextResponse.json({ error: "Choose a valid scene asset mode." }, { status: 400 })
    }

    const [projectResult, sceneResult] = await Promise.all([
      client.database
        .from("ai_video_projects")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      client.database
        .from("ai_video_scenes")
        .select("id,start_time,end_time")
        .eq("id", sceneId)
        .eq("project_id", id)
        .eq("user_id", user.id)
        .single(),
    ])

    if (projectResult.error || !projectResult.data || sceneResult.error || !sceneResult.data) {
      return NextResponse.json({ error: "AI video scene not found." }, { status: 404 })
    }

    const clipSeconds =
      body.mode === "ai_video" || body.mode === "avatar_video"
        ? aiVideoClipSeconds(sceneResult.data)
        : 0
    const credits = sceneAssetCredits(body.mode, clipSeconds)

    if (credits > 0) {
      const { data: creditRow, error: creditError } = await client.database
        .from("user_credits")
        .select("balance")
        .eq("user_id", user.id)
        .single()

      if (creditError || !creditRow) {
        return NextResponse.json(
          { error: "Credit balance is not ready. Refresh and try again." },
          { status: 409 }
        )
      }

      if (Number(creditRow.balance ?? 0) < credits) {
        return NextResponse.json(
          { error: `Not enough credits. This AI video scene costs ${credits} credits.` },
          { status: 402 }
        )
      }
    }

    const handle = await tasks.trigger<typeof editAiVideoSceneAssetTask>(
      "edit-ai-video-scene-asset",
      {
        projectId: id,
        sceneId,
        userId: user.id,
        mode: body.mode,
        prompt: body.prompt?.trim() ?? "",
      },
      {
        tags: [`user:${user.id}`, `ai-video-agent:${id}`, `scene:${sceneId}`],
      },
      {
        publicAccessToken: {
          expirationTime: "2hr",
        },
      }
    )

    return NextResponse.json({
      runId: handle.id,
      publicAccessToken: handle.publicAccessToken,
      clipSeconds,
      credits,
    })
  } catch (triggerError) {
    return NextResponse.json(
      {
        error:
          triggerError instanceof Error
            ? triggerError.message
            : "Unable to start scene asset update.",
      },
      { status: 500 }
    )
  }
}
