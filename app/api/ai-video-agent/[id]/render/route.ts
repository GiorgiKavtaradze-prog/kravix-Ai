import { NextResponse } from "next/server"

import {
  buildAiVideoAgentObjectKey,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
} from "@/lib/ai-video-agent"
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

    const project = projectResult.data as AiVideoProjectRecord
    const scenes = (scenesResult.data ?? []) as AiVideoSceneRecord[]
    const assets = (assetsResult.data ?? []) as AiVideoAssetRecord[]
    const exportManifest = {
      project,
      scenes,
      assets,
      composition: project.composition_data,
      note: "This export manifest contains the full Remotion composition inputs. A production render worker can consume it to render MP4.",
      createdAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(exportManifest, null, 2)], {
      type: "application/json",
    })
    const bucket = client.storage.from("avatars")
    const objectKey = buildAiVideoAgentObjectKey(user.id, id, "final-remotion-export.json")
    const { error: uploadError } = await bucket.upload(objectKey, blob)

    if (uploadError) throw new Error(uploadError.message)

    const exportUrl = bucket.getPublicUrl(objectKey)

    await client.database
      .from("ai_video_assets")
      .insert({
        id: crypto.randomUUID(),
        project_id: id,
        scene_id: null,
        user_id: user.id,
        asset_type: "final_render",
        url: exportUrl,
        mime_type: "application/json",
        provider: "remotion-export-manifest",
        metadata: { filename: "final-remotion-export.json" },
      })

    await client.database
      .from("ai_video_projects")
      .update({
        final_video_url: exportUrl,
        final_video_mime_type: "application/json",
      })
      .eq("id", id)
      .eq("user_id", user.id)

    return NextResponse.json({
      url: exportUrl,
      mimeType: "application/json",
    })
  } catch (renderError) {
    return NextResponse.json(
      {
        error:
          renderError instanceof Error
            ? renderError.message
            : "Unable to prepare the Remotion export.",
      },
      { status: 500 }
    )
  }
}
