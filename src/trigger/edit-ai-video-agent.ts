import { GoogleGenAI } from "@google/genai"
import { metadata, task } from "@trigger.dev/sdk"
import Replicate from "replicate"

import {
  buildAiVideoAgentObjectKey,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
  type RemotionSceneData,
} from "../../lib/ai-video-agent"
import { buildAiVideoAgentComposition } from "../../lib/ai-video-agent-composition"
import {
  AI_VIDEO_AGENT_IMAGE_CREDITS,
  AI_VIDEO_AGENT_VIDEO_CREDITS,
  calculateAvatarVideoCredits,
} from "../../lib/credits"
import { createInsForgeServerClient } from "../../lib/insforge/server"
import { getDefaultVoice } from "../../lib/voices"

type SceneAssetMode = "ai_image" | "ai_video" | "stock" | "illustration" | "avatar_video"

type EditSceneAssetPayload = {
  projectId: string
  sceneId: string
  userId: string
  mode: SceneAssetMode
  prompt: string
}

type DomoUploadResponse = {
  data?: {
    presigned_url?: string
    headers?: Record<string, string>
    domoai_uri?: string
  }
  message?: string
  detail?: string
}

type DomoTaskResponse = {
  data?: {
    task_id?: string
    id?: string
    status?: string
    output_videos?: Array<{ url?: string }>
  }
  message?: string
  detail?: string
}

async function setProgress(stage: string, progress: number, message: string) {
  metadata.set("stage", stage).set("progress", progress).set("message", message)
  await metadata.flush()
}

function extensionForMime(contentType: string | null | undefined, fallback: string) {
  if (contentType?.includes("jpeg")) return "jpg"
  if (contentType?.includes("png")) return "png"
  if (contentType?.includes("webp")) return "webp"
  if (contentType?.includes("mpeg")) return "mp3"
  if (contentType?.includes("wav")) return "wav"
  if (contentType?.includes("webm")) return "webm"
  if (contentType?.includes("mp4")) return "mp4"
  return fallback
}

async function outputToBlob(output: unknown, fallbackType: string) {
  if (output instanceof Blob) return output

  if (
    output &&
    typeof output === "object" &&
    "arrayBuffer" in output &&
    typeof output.arrayBuffer === "function"
  ) {
    const fileOutput = output as { arrayBuffer: () => Promise<ArrayBuffer>; type?: string }
    return new Blob([await fileOutput.arrayBuffer()], {
      type: fileOutput.type ?? fallbackType,
    })
  }

  const outputUrl =
    output &&
      typeof output === "object" &&
      "url" in output &&
      typeof output.url === "function"
      ? String((output as { url: () => URL | string }).url())
      : typeof output === "string"
        ? output
        : null

  if (!outputUrl) throw new Error("The provider did not return a media file.")

  const response = await fetch(outputUrl)
  if (!response.ok) throw new Error("Unable to download generated media.")

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? fallbackType,
  })
}

async function uploadBlob({
  userId,
  projectId,
  filename,
  blob,
}: {
  userId: string
  projectId: string
  filename: string
  blob: Blob
}) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from("avatars")
  const objectKey = buildAiVideoAgentObjectKey(userId, projectId, filename)
  const { error } = await bucket.upload(objectKey, blob)

  if (error) throw new Error(error.message)

  return bucket.getPublicUrl(objectKey)
}

async function fetchBlob(url: string, fallbackType: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to download media from ${url}.`)

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? fallbackType,
  })
}

async function saveAsset(input: {
  projectId: string
  userId: string
  sceneId?: string | null
  assetType: AiVideoAssetRecord["asset_type"]
  url?: string | null
  mimeType?: string | null
  provider?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const client = createInsForgeServerClient()
  const { data, error } = await client.database
    .from("ai_video_assets")
    .insert({
      id: crypto.randomUUID(),
      project_id: input.projectId,
      scene_id: input.sceneId ?? null,
      user_id: input.userId,
      asset_type: input.assetType,
      url: input.url ?? null,
      mime_type: input.mimeType ?? null,
      provider: input.provider ?? null,
      metadata: input.metadata ?? null,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)

  return data as AiVideoAssetRecord
}

function aiVideoClipSeconds(scene: AiVideoSceneRecord) {
  const duration = Math.max(1, Number(scene.end_time) - Number(scene.start_time))
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

async function debitCredits({
  userId,
  projectId,
  credits,
  description,
}: {
  userId: string
  projectId: string
  credits: number
  description: string
}) {
  if (credits <= 0) return false

  const client = createInsForgeServerClient()
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (creditError || !creditRow) {
    throw new Error("Credit balance is not ready. Refresh and try again.")
  }

  const currentBalance = Number(creditRow.balance ?? 0)

  if (currentBalance < credits) {
    throw new Error(`Not enough credits. This AI video scene costs ${credits} credits.`)
  }

  const { data: debitedCredits, error: debitError } = await client.database
    .from("user_credits")
    .update({ balance: currentBalance - credits })
    .eq("user_id", userId)
    .eq("balance", currentBalance)
    .select("*")
    .single()

  if (debitError || !debitedCredits) {
    throw new Error(debitError?.message ?? "Unable to deduct credits. Try again.")
  }

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: -credits,
    type: "debit",
    description,
    reference_id: projectId,
  })

  return true
}

async function refundCredits({
  userId,
  projectId,
  credits,
  description,
}: {
  userId: string
  projectId: string
  credits: number
  description: string
}) {
  if (credits <= 0) return

  const client = createInsForgeServerClient()
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (creditError || !creditRow) return

  await client.database
    .from("user_credits")
    .update({ balance: Number(creditRow.balance ?? 0) + credits })
    .eq("user_id", userId)

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: credits,
    type: "refund",
    description,
    reference_id: projectId,
  })
}

async function loadProjectBundle(projectId: string, sceneId: string, userId: string) {
  const client = createInsForgeServerClient()
  const [projectResult, sceneResult, scenesResult, assetsResult] = await Promise.all([
    client.database
      .from("ai_video_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single(),
    client.database
      .from("ai_video_scenes")
      .select("*")
      .eq("id", sceneId)
      .eq("project_id", projectId)
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
  if (sceneResult.error || !sceneResult.data) {
    throw new Error(sceneResult.error?.message ?? "Unable to load the AI video scene.")
  }
  if (scenesResult.error) throw new Error(scenesResult.error.message)
  if (assetsResult.error) throw new Error(assetsResult.error.message)

  return {
    project: projectResult.data as AiVideoProjectRecord,
    scene: sceneResult.data as AiVideoSceneRecord,
    scenes: (scenesResult.data ?? []) as AiVideoSceneRecord[],
    assets: (assetsResult.data ?? []) as AiVideoAssetRecord[],
  }
}

async function markSceneVisualAssetsSuperseded(assets: AiVideoAssetRecord[], sceneId: string) {
  const client = createInsForgeServerClient()
  const visualTypes = ["broll_image", "broll_video", "ai_video", "remotion_component", "avatar_clip"]
  const targets = assets.filter(
    (asset) => asset.scene_id === sceneId && visualTypes.includes(asset.asset_type)
  )

  await Promise.all(
    targets.map((asset) =>
      client.database
        .from("ai_video_assets")
        .update({
          metadata: {
            ...(asset.metadata ?? {}),
            superseded: true,
            superseded_at: new Date().toISOString(),
          },
        })
        .eq("id", asset.id)
    )
  )
}

async function refreshProjectComposition(project: AiVideoProjectRecord, scenes: AiVideoSceneRecord[]) {
  const client = createInsForgeServerClient()
  const { data: freshAssets, error } = await client.database
    .from("ai_video_assets")
    .select("*")
    .eq("project_id", project.id)
    .eq("user_id", project.user_id)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const assets = (freshAssets ?? []) as AiVideoAssetRecord[]
  const captions = project.captions?.map((caption) => ({
    ...caption,
    style: project.caption_style,
  })) ?? []
  const composition = buildAiVideoAgentComposition({ project, scenes, assets, captions })
  const thumbnailUrl =
    assets
      .filter((asset) => !(asset.metadata as { superseded?: boolean } | null)?.superseded)
      .find((asset) => asset.scene_id && asset.url)?.url ??
    project.thumbnail_url ??
    project.avatar_image_url

  await client.database
    .from("ai_video_projects")
    .update({
      composition_data: composition,
      thumbnail_url: thumbnailUrl,
      final_video_url: null,
      final_video_mime_type: null,
    })
    .eq("id", project.id)
    .eq("user_id", project.user_id)

  return { composition, thumbnailUrl }
}

async function generateImage(project: AiVideoProjectRecord, scene: AiVideoSceneRecord, prompt: string) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in the Trigger.dev environment.")

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateImages({
    model: "imagen-3.0-generate-002",
    prompt: `${prompt}. Create a polished cinematic scene asset. No text, logos, captions, or watermarks.`,
    config: {
      numberOfImages: 1,
      outputMimeType: "image/png",
      aspectRatio: project.screen_size,
    },
  })
  const base64Data = response.generatedImages?.[0]?.image?.imageBytes

  if (!base64Data) {
    throw new Error("Gemini did not return an image.")
  }

  const mimeType = "image/png"
  const blob = new Blob([Buffer.from(base64Data, "base64")], { type: mimeType })
  const url = await uploadBlob({
    userId: project.user_id,
    projectId: project.id,
    filename: `scene-${scene.scene_index + 1}-edit-image.png`,
    blob,
  })

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    sceneId: scene.id,
    assetType: "broll_image",
    url,
    mimeType,
    provider: "gemini",
    metadata: { prompt, editMode: "ai_image" },
  })
}

async function generateVideo(
  project: AiVideoProjectRecord,
  scene: AiVideoSceneRecord,
  prompt: string,
  seconds: number
) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Missing REPLICATE_API_TOKEN in the Trigger.dev environment.")
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const timedPrompt = [
    prompt,
    `Generate a polished AI B-roll video clip that is no longer than ${seconds} seconds.`,
    "No text, captions, logos, or watermarks.",
  ].join(" ")
  const output = await replicate.run("wan-video/wan-2.2-t2v-fast", {
    input: {
      prompt: timedPrompt,
      duration: seconds,
      seconds,
    },
  })
  const blob = await outputToBlob(output, "video/mp4")
  const url = await uploadBlob({
    userId: project.user_id,
    projectId: project.id,
    filename: `scene-${scene.scene_index + 1}-edit-video.${extensionForMime(blob.type, "mp4")}`,
    blob,
  })

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    sceneId: scene.id,
    assetType: "ai_video",
    url,
    mimeType: blob.type || "video/mp4",
    provider: "replicate",
    metadata: {
      prompt,
      seconds,
      creditsCharged: aiVideoClipCredits(),
      model: "wan-video/wan-2.2-t2v-fast",
      editMode: "ai_video",
    },
  })
}

async function fetchStock(project: AiVideoProjectRecord, scene: AiVideoSceneRecord, prompt: string) {
  if (!process.env.PIXABAY_API_KEY) throw new Error("Missing PIXABAY_API_KEY in the Trigger.dev environment.")

  const url = new URL("https://pixabay.com/api/videos/")
  url.searchParams.set("key", process.env.PIXABAY_API_KEY)
  url.searchParams.set("q", prompt || scene.stock_keyword || scene.title)
  url.searchParams.set("per_page", "3")
  url.searchParams.set("safesearch", "true")

  const response = await fetch(url)
  if (!response.ok) throw new Error("Pixabay search failed.")

  const data = (await response.json()) as {
    hits?: Array<{ videos?: { medium?: { url?: string }; small?: { url?: string } }; picture_id?: string }>
  }
  const hit = data.hits?.[0]
  let mediaUrl = hit?.videos?.medium?.url ?? hit?.videos?.small?.url ?? null
  let assetType: AiVideoAssetRecord["asset_type"] = "broll_video"
  let mimeType = "video/mp4"

  if (!mediaUrl) {
    const imgUrl = new URL("https://pixabay.com/api/")
    imgUrl.searchParams.set("key", process.env.PIXABAY_API_KEY)
    imgUrl.searchParams.set("q", prompt || scene.stock_keyword || scene.title)
    imgUrl.searchParams.set("image_type", "photo")
    imgUrl.searchParams.set("safesearch", "true")

    const imgResponse = await fetch(imgUrl)
    if (imgResponse.ok) {
      const imgData = (await imgResponse.json()) as { hits?: Array<{ largeImageURL?: string; webformatURL?: string }> }
      const imgHit = imgData.hits?.[0]
      mediaUrl = imgHit?.largeImageURL ?? imgHit?.webformatURL ?? null
      assetType = "broll_image"
      mimeType = "image/jpeg"
    }
  }

  if (!mediaUrl) throw new Error("No stock media matched that prompt.")

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    sceneId: scene.id,
    assetType,
    url: mediaUrl,
    mimeType,
    provider: "pixabay",
    metadata: { keyword: prompt, pictureId: hit?.picture_id, editMode: "stock" },
  })
}

function fallbackIllustrationCode(scene: AiVideoSceneRecord, prompt: string) {
  const remotionData = (scene.remotion_data ?? {}) as RemotionSceneData
  const accent = remotionData.accentColor ?? "#14b8a6"

  return `import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function SceneAnimation({ title = ${JSON.stringify(scene.title)}, summary = ${JSON.stringify(prompt || scene.summary)}, accentColor = ${JSON.stringify(accent)} }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const drift = interpolate(frame % 180, [0, 90, 180], [-24, 24, -24]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg,#08111f,#12343b 52%,#271820)", overflow: "hidden", color: "white" }}>
      <div style={{ position: "absolute", inset: 0, background: \`radial-gradient(circle at 24% 28%, \${accentColor}55, transparent 32%), radial-gradient(circle at 78% 72%, rgba(249,115,22,0.25), transparent 34%)\` }} />
      <div style={{ position: "absolute", left: "12%", top: "16%", width: "30%", aspectRatio: "1", borderRadius: 999, background: accentColor, opacity: 0.28, transform: \`translateX(\${drift}px)\` }} />
      <div style={{ position: "absolute", right: "11%", top: "18%", width: "34%", aspectRatio: "1.35", borderRadius: 34, border: "1px solid rgba(255,255,255,0.24)", background: "rgba(255,255,255,0.1)", transform: \`translateY(\${-drift}px) rotate(\${drift / 10}deg)\` }} />
      <div style={{ position: "absolute", left: "9%", right: "9%", bottom: "12%", opacity: enter, transform: \`translateY(\${interpolate(enter, [0, 1], [42, 0])}px)\` }}>
        <div style={{ display: "inline-flex", borderRadius: 999, padding: "10px 16px", background: accentColor, color: "#06111f", fontWeight: 900 }}>Scene ${scene.scene_index + 1}</div>
        <h1 style={{ margin: "22px 0 12px", maxWidth: 1050, fontSize: 76, lineHeight: 0.94, fontWeight: 950 }}>{title}</h1>
        <p style={{ margin: 0, maxWidth: 940, fontSize: 31, lineHeight: 1.22, color: "rgba(255,255,255,0.78)" }}>{summary}</p>
      </div>
    </AbsoluteFill>
  );
}
`
}

async function saveIllustration(project: AiVideoProjectRecord, scene: AiVideoSceneRecord, prompt: string) {
  const source = fallbackIllustrationCode(scene, prompt)
  const blob = new Blob([source], { type: "text/tsx" })
  const url = await uploadBlob({
    userId: project.user_id,
    projectId: project.id,
    filename: `scene-${scene.scene_index + 1}-edit-animation.tsx`,
    blob,
  })

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    sceneId: scene.id,
    assetType: "remotion_component",
    url,
    mimeType: "text/tsx",
    provider: "remotion-editor",
    metadata: {
      prompt,
      editMode: "illustration",
      componentName: "SceneAnimation",
      illustrationReactCode: source,
    },
  })
}

async function generateVoiceover(project: AiVideoProjectRecord, scene: AiVideoSceneRecord) {
  if (project.voice_type === "default") {
    const voice = getDefaultVoice(project.voice_id)
    if (!voice) throw new Error("Choose a valid default voice.")
    if (!process.env.DEEPGRAM_API_KEY) throw new Error("Missing DEEPGRAM_API_KEY in the Trigger.dev environment.")

    const url = new URL("https://api.deepgram.com/v1/speak")
    url.searchParams.set("model", voice.model)
    url.searchParams.set("encoding", "mp3")
    url.searchParams.set("speed", "0.9")

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: scene.voiceover_segment }),
    })

    if (!response.ok) throw new Error("Deepgram did not generate scene voiceover.")

    return new Blob([await response.arrayBuffer()], {
      type: response.headers.get("content-type") ?? "audio/mpeg",
    })
  }

  if (!process.env.REPLICATE_API_TOKEN) throw new Error("Missing REPLICATE_API_TOKEN in the Trigger.dev environment.")

  const client = createInsForgeServerClient()
  const { data: voice, error } = await client.database
    .from("voice_clones")
    .select("*")
    .eq("id", project.voice_id)
    .eq("user_id", project.user_id)
    .single()
  if (error || !voice?.sample_url) throw new Error("Unable to load the cloned voice.")

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run("resemble-ai/chatterbox", {
    input: {
      prompt: scene.voiceover_segment,
      audio_prompt: String(voice.sample_url),
    },
  })

  return outputToBlob(output, "audio/wav")
}

function sceneVoiceDuration(project: AiVideoProjectRecord, scene: AiVideoSceneRecord) {
  const sceneStart = Number(scene.start_time)
  const sceneEnd = Number(scene.end_time)
  const captionDuration =
    project.captions
      ?.filter((caption) => caption.start < sceneEnd && caption.end > sceneStart)
      .reduce((max, caption) => Math.max(max, Math.min(caption.end, sceneEnd) - Math.max(caption.start, sceneStart)), 0) ?? 0
  const fallbackDuration = Math.max(1, sceneEnd - sceneStart)

  return Math.min(5, Math.max(1, Math.ceil(captionDuration || fallbackDuration)))
}

function requireDomoApiKey() {
  const apiKey = process.env.DOMOAI_API_KEY
  if (!apiKey) throw new Error("Missing DOMOAI_API_KEY in the Trigger.dev environment.")
  return apiKey
}

async function domoRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.domoai.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireDomoApiKey()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  const data = (await response.json().catch(() => null)) as T | null
  if (!response.ok || !data) throw new Error(`DomoAI request failed for ${path}.`)
  return data
}

async function uploadToDomo(filename: string, file: Blob) {
  const upload = await domoRequest<DomoUploadResponse>("/upload/file", {
    method: "POST",
    body: JSON.stringify({ filename }),
  })
  const presignedUrl = upload.data?.presigned_url
  const domoaiUri = upload.data?.domoai_uri
  if (!presignedUrl || !domoaiUri) {
    throw new Error(upload.detail ?? upload.message ?? "DomoAI did not return an upload URL.")
  }

  const uploadResponse = await fetch(presignedUrl, {
    method: "PUT",
    headers: upload.data?.headers ?? {},
    body: file,
  })
  if (!uploadResponse.ok) throw new Error("Unable to upload media to DomoAI.")
  return domoaiUri
}

function isDomoDone(status?: string) {
  return ["SUCCESS", "SUCCEEDED", "COMPLETED", "DONE"].includes(status?.toUpperCase() ?? "")
}

function isDomoFailed(status?: string) {
  return ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(status?.toUpperCase() ?? "")
}

async function waitForDomoVideo(taskId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const taskResult = await domoRequest<DomoTaskResponse>(`/tasks/${taskId}`)
    const taskData = taskResult.data
    const status = taskData?.status
    if (taskData?.output_videos?.[0]?.url && (!status || isDomoDone(status))) {
      return taskData.output_videos[0].url
    }
    if (isDomoFailed(status)) {
      throw new Error(taskResult.detail ?? taskResult.message ?? "DomoAI avatar clip generation failed.")
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error("DomoAI avatar clip generation timed out.")
}

async function generateAvatarVideo(project: AiVideoProjectRecord, scene: AiVideoSceneRecord, prompt: string) {
  if (!project.avatar_image_url) throw new Error("The project avatar image is missing.")

  const seconds = sceneVoiceDuration(project, scene)
  const [image, audio] = await Promise.all([
    fetchBlob(project.avatar_image_url, "image/png"),
    generateVoiceover(project, scene),
  ])
  const [imageUri, audioUri] = await Promise.all([
    uploadToDomo("avatar.png", image),
    uploadToDomo(`scene-audio.${extensionForMime(audio.type, "mp3")}`, audio),
  ])
  const response = await domoRequest<DomoTaskResponse>("/video/talking-avatar", {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt || "natural presenter expression for a polished AI video",
      image: { domoai_uri: imageUri },
      audio: { domoai_uri: audioUri },
      seconds,
      aspect_ratio: project.screen_size,
      model: "talking-avatar-v1",
    }),
  })
  const taskId = response.data?.task_id ?? response.data?.id
  if (!taskId) throw new Error(response.detail ?? response.message ?? "DomoAI did not return a task id.")

  const outputUrl = await waitForDomoVideo(taskId)
  const clip = await fetchBlob(outputUrl, "video/mp4")
  const url = await uploadBlob({
    userId: project.user_id,
    projectId: project.id,
    filename: `scene-${scene.scene_index + 1}-avatar-video.${extensionForMime(clip.type, "mp4")}`,
    blob: clip,
  })

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    sceneId: scene.id,
    assetType: "avatar_clip",
    url,
    mimeType: clip.type || "video/mp4",
    provider: "domoai",
    metadata: {
      prompt,
      taskId,
      seconds,
      editMode: "avatar_video",
      start: Number(scene.start_time),
      end: Math.min(Number(scene.start_time) + seconds, Number(scene.end_time)),
      remainderHandledByExistingBroll: true,
    },
  })
}

export const editAiVideoSceneAssetTask = task({
  id: "edit-ai-video-scene-asset",
  maxDuration: 3600,
  run: async (payload: EditSceneAssetPayload) => {
    let debitedCredits = 0

    try {
      await setProgress("loading_project", 8, "Loading scene context.")
      const { project, scene, scenes, assets } = await loadProjectBundle(
        payload.projectId,
        payload.sceneId,
        payload.userId
      )
      const prompt = payload.prompt || scene.visual_prompt || scene.summary
      const clipSeconds =
        payload.mode === "ai_video" || payload.mode === "avatar_video"
          ? aiVideoClipSeconds(scene)
          : 0
      debitedCredits = sceneAssetCredits(payload.mode, clipSeconds)

      if (debitedCredits > 0) {
        await setProgress(
          "deducting_credits",
          18,
          `Deducting ${debitedCredits} credits for this scene asset.`
        )
        await debitCredits({
          userId: project.user_id,
          projectId: project.id,
          credits: debitedCredits,
          description: `AI Video Agent scene ${scene.scene_index + 1} asset edit`,
        })
      }

      await setProgress("generating_asset", 35, "Generating replacement scene asset.")
      let asset: AiVideoAssetRecord

      if (payload.mode === "ai_image") {
        asset = await generateImage(project, scene, prompt)
      } else if (payload.mode === "ai_video") {
        asset = await generateVideo(project, scene, prompt, clipSeconds)
      } else if (payload.mode === "stock") {
        asset = await fetchStock(project, scene, prompt)
      } else if (payload.mode === "illustration") {
        asset = await saveIllustration(project, scene, prompt)
      } else {
        asset = await generateAvatarVideo(project, scene, prompt)
      }

      await setProgress("saving_asset", 74, "Replacing the selected scene asset.")
      await markSceneVisualAssetsSuperseded(
        assets.filter((item) => item.id !== asset.id),
        scene.id
      )

      await setProgress("refreshing_composition", 88, "Refreshing Remotion composition data.")
      await refreshProjectComposition(project, scenes)

      await setProgress("completed", 100, "Scene asset updated.")
      return {
        projectId: project.id,
        sceneId: scene.id,
        assetId: asset.id,
        url: asset.url,
        creditsCharged: debitedCredits,
      }
    } catch (error) {
      if (debitedCredits > 0) {
        await refundCredits({
          userId: payload.userId,
          projectId: payload.projectId,
          credits: debitedCredits,
          description: "AI Video Agent scene B-roll edit failed",
        })
      }

      const message = error instanceof Error ? error.message : "Scene asset update failed."
      metadata.set("error", message)
      await setProgress("failed", 100, message)
      throw error
    }
  },
})
