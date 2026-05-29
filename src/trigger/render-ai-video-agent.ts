import { renderMedia, selectComposition } from "@remotion/renderer"
import { metadata, task } from "@trigger.dev/sdk"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import {
  buildAiVideoAgentObjectKey,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
} from "../../lib/ai-video-agent"
import { buildAiVideoAgentComposition } from "../../lib/ai-video-agent-composition"
import { createInsForgeServerClient } from "../../lib/insforge/server"

type RenderAiVideoAgentPayload = {
  projectId: string
  userId: string
}

async function setProgress(stage: string, progress: number, message: string) {
  metadata.set("stage", stage).set("progress", progress).set("message", message)
  await metadata.flush()
}

async function loadProjectBundle(projectId: string, userId: string) {
  const client = createInsForgeServerClient()
  const [projectResult, scenesResult, assetsResult] = await Promise.all([
    client.database
      .from("ai_video_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single(),
    client.database
      .from("ai_video_scenes")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("scene_index", { ascending: true }),
    client.database
      .from("ai_video_assets")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ])

  if (projectResult.error || !projectResult.data) {
    throw new Error(projectResult.error?.message ?? "Unable to load the AI video project.")
  }
  if (scenesResult.error) throw new Error(scenesResult.error.message)
  if (assetsResult.error) throw new Error(assetsResult.error.message)

  return {
    project: projectResult.data as AiVideoProjectRecord,
    scenes: (scenesResult.data ?? []) as AiVideoSceneRecord[],
    assets: (assetsResult.data ?? []) as AiVideoAssetRecord[],
  }
}

async function uploadMp4(project: AiVideoProjectRecord, outputLocation: string) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from("avatars")
  const objectKey = buildAiVideoAgentObjectKey(
    project.user_id,
    project.id,
    `updated-render-${Date.now()}.mp4`
  )
  const blob = new Blob([await readFile(outputLocation)], { type: "video/mp4" })
  const { error } = await bucket.upload(objectKey, blob)

  if (error) throw new Error(error.message)

  return bucket.getPublicUrl(objectKey)
}

export const renderAiVideoAgentTask = task({
  id: "render-ai-video-agent",
  maxDuration: 3600,
  run: async (payload: RenderAiVideoAgentPayload) => {
    const client = createInsForgeServerClient()

    await setProgress("loading_project", 8, "Loading updated video composition.")
    const { project, scenes, assets } = await loadProjectBundle(payload.projectId, payload.userId)
    const captions = project.captions?.map((caption) => ({
      ...caption,
      style: project.caption_style,
    })) ?? []
    const compositionData = buildAiVideoAgentComposition({ project, scenes, assets, captions })

    await client.database
      .from("ai_video_projects")
      .update({
        status: "rendering",
        progress: 12,
        progress_stage: "rendering",
        composition_data: compositionData,
        final_video_url: null,
        final_video_mime_type: null,
      })
      .eq("id", project.id)
      .eq("user_id", project.user_id)

    const serveUrl = process.env.REMOTION_AI_VIDEO_AGENT_SERVE_URL ?? process.env.REMOTION_SERVE_URL
    const compositionId = process.env.REMOTION_AI_VIDEO_AGENT_COMPOSITION_ID ?? "AiVideoAgentComposition"

    if (!serveUrl) {
      throw new Error(
        "Set REMOTION_AI_VIDEO_AGENT_SERVE_URL to a bundled Remotion serve URL before exporting MP4 files."
      )
    }

    await setProgress("selecting_composition", 20, "Selecting Remotion composition.")
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: { composition: compositionData },
    })
    const outputLocation = join("/tmp", `ai-video-agent-${project.id}-${Date.now()}.mp4`)

    await setProgress("rendering", 30, "Rendering updated MP4.")
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation,
      inputProps: { composition: compositionData },
      overwrite: true,
      onProgress: (progress) => {
        const percent = 30 + Math.round(progress.progress * 58)
        void setProgress("rendering", percent, "Rendering updated MP4.")
      },
    })

    await setProgress("uploading", 90, "Uploading rendered MP4.")
    const renderUrl = await uploadMp4(project, outputLocation)

    await client.database.from("ai_video_assets").insert({
      id: crypto.randomUUID(),
      project_id: project.id,
      scene_id: null,
      user_id: project.user_id,
      asset_type: "final_render",
      url: renderUrl,
      mime_type: "video/mp4",
      provider: "remotion-renderer",
      metadata: {
        compositionId,
        durationSeconds: compositionData.durationSeconds,
      },
    })

    await client.database
      .from("ai_video_projects")
      .update({
        status: "completed",
        progress: 100,
        progress_stage: "completed",
        final_video_url: renderUrl,
        final_video_mime_type: "video/mp4",
      })
      .eq("id", project.id)
      .eq("user_id", project.user_id)

    await setProgress("completed", 100, "Updated video exported.")
    return { projectId: project.id, url: renderUrl }
  },
})
