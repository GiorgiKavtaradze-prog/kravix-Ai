import type { renderAiVideoAgentTask } from "@/src/trigger/render-ai-video-agent"
import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"

import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const { data: project, error: projectError } = await client.database
      .from("ai_video_projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: "AI video project not found." }, { status: 404 })
    }

    const handle = await tasks.trigger<typeof renderAiVideoAgentTask>(
      "render-ai-video-agent",
      {
        projectId: id,
        userId: user.id,
      },
      {
        tags: [`user:${user.id}`, `ai-video-agent:${id}`, "ai-video-render"],
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
    })
  } catch (renderError) {
    return NextResponse.json(
      {
        error:
          renderError instanceof Error
            ? renderError.message
            : "Unable to start the video export.",
      },
      { status: 500 }
    )
  }
}
