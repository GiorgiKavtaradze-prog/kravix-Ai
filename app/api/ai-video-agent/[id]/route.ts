import { NextResponse } from "next/server"

import type {
  AiVideoAssetRecord,
  AiVideoProjectRecord,
  AiVideoSceneRecord,
} from "@/lib/ai-video-agent"
import { getAuthenticatedInsForgeClient } from "@/lib/insforge/request-auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const [projectResult, scenesResult, assetsResult] = await Promise.all([
      client.database
        .from("ai_video_projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      client.database
        .from("ai_video_scenes")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("scene_index", { ascending: true }),
      client.database
        .from("ai_video_assets")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ])

    if (projectResult.error || !projectResult.data) {
      return NextResponse.json({ error: "AI video project not found." }, { status: 404 })
    }

    if (scenesResult.error) throw new Error(scenesResult.error.message)
    if (assetsResult.error) throw new Error(assetsResult.error.message)

    return NextResponse.json({
      project: projectResult.data as AiVideoProjectRecord,
      scenes: (scenesResult.data ?? []) as AiVideoSceneRecord[],
      assets: (assetsResult.data ?? []) as AiVideoAssetRecord[],
    })
  } catch (fetchError) {
    return NextResponse.json(
      {
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load AI video project.",
      },
      { status: 500 }
    )
  }
}
