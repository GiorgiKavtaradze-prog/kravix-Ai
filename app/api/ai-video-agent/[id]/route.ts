import { NextResponse } from "next/server"

import {
  isAiVideoAgentCaptionStyle,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
} from "@/lib/ai-video-agent"
import { buildAiVideoAgentComposition } from "@/lib/ai-video-agent-composition"
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const { error: deleteError } = await client.database
      .from("ai_video_projects")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }

    return NextResponse.json({ success: true })
  } catch (deleteError) {
    return NextResponse.json(
      {
        error:
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to delete AI video project.",
      },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user, error } = await getAuthenticatedInsForgeClient(request)

  if (error || !client || !user) {
    return NextResponse.json({ error }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { captionStyle?: string }

    if (body.captionStyle !== undefined && !isAiVideoAgentCaptionStyle(body.captionStyle)) {
      return NextResponse.json({ error: "Choose a valid caption design." }, { status: 400 })
    }

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

    const originalProject = projectResult.data as AiVideoProjectRecord
    const scenes = (scenesResult.data ?? []) as AiVideoSceneRecord[]
    const assets = (assetsResult.data ?? []) as AiVideoAssetRecord[]
    const captionStyle = body.captionStyle ?? originalProject.caption_style
    const captions =
      originalProject.captions?.map((caption) => ({ ...caption, style: captionStyle })) ?? []
    const project = {
      ...originalProject,
      caption_style: captionStyle,
      captions,
      final_video_url: null,
      final_video_mime_type: null,
    } satisfies AiVideoProjectRecord
    const composition = buildAiVideoAgentComposition({
      project,
      scenes,
      assets,
      captions,
    })

    const { data: updatedProject, error: updateError } = await client.database
      .from("ai_video_projects")
      .update({
        caption_style: captionStyle,
        captions,
        composition_data: composition,
        final_video_url: null,
        final_video_mime_type: null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (updateError || !updatedProject) {
      throw new Error(updateError?.message ?? "Unable to save AI video changes.")
    }

    return NextResponse.json({
      project: updatedProject as AiVideoProjectRecord,
      scenes,
      assets,
    })
  } catch (patchError) {
    return NextResponse.json(
      {
        error:
          patchError instanceof Error
            ? patchError.message
            : "Unable to save AI video changes.",
      },
      { status: 500 }
    )
  }
}
