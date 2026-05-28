import { metadata, task } from "@trigger.dev/sdk"
import Replicate from "replicate"

import {
  buildAvatarVideoObjectKey,
  type AvatarVideoRecord,
  type AvatarVideoStatus,
} from "../../lib/avatar-videos"
import { createInsForgeServerClient } from "../../lib/insforge/server"
import { buildTtsAudioObjectKey, getDefaultVoice } from "../../lib/voices"

type GenerateAvatarVideoPayload = {
  videoId: string
  userId: string
  creditsCharged: number
}

type ProgressStage =
  | "queued"
  | "preparing_avatar"
  | "preparing_voice"
  | "generating_video"
  | "processing_output"
  | "uploading_to_storage"
  | "completed"
  | "failed"

type DomoUploadResponse = {
  code: number
  data?: {
    presigned_url?: string
    headers?: Record<string, string>
    domoai_uri?: string
  }
  message?: string
  detail?: string
}

type DomoTaskResponse = {
  code: number
  data?: {
    task_id?: string
    id?: string
    status?: string
    credits?: number
    output_videos?: Array<{
      url?: string
      width?: number
      height?: number
    }>
  }
  message?: string
  detail?: string
}

async function setProgress(stage: ProgressStage, progress: number, message: string) {
  metadata
    .set("stage", stage)
    .set("progress", progress)
    .set("message", message)

  await metadata.flush()
}

async function updateAvatarVideo(
  videoId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("avatar_videos")
    .update(values)
    .eq("id", videoId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function loadAvatarVideo(videoId: string, userId: string) {
  const client = createInsForgeServerClient()
  const { data, error } = await client.database
    .from("avatar_videos")
    .select("*")
    .eq("id", videoId)
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to load avatar video request.")
  }

  return data as AvatarVideoRecord
}

async function loadCustomVoice(voiceId: string, userId: string) {
  const client = createInsForgeServerClient()
  const { data, error } = await client.database
    .from("voice_clones")
    .select("*")
    .eq("id", voiceId)
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to load the cloned voice.")
  }

  return data as { sample_url: string; name: string }
}

async function refundCredits({
  userId,
  videoId,
  credits,
}: {
  userId: string
  videoId: string
  credits: number
}) {
  if (credits <= 0) {
    return
  }

  const client = createInsForgeServerClient()
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (creditError || !creditRow) {
    return
  }

  await client.database
    .from("user_credits")
    .update({ balance: Number(creditRow.balance ?? 0) + credits })
    .eq("user_id", userId)

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: credits,
    type: "refund",
    description: "Avatar video generation failed",
    reference_id: videoId,
  })
}

function absoluteAssetUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!appUrl) {
    throw new Error("Set NEXT_PUBLIC_APP_URL so Trigger.dev can load local avatar assets.")
  }

  return new URL(url, appUrl).toString()
}

async function fetchBlob(url: string, fallbackType: string) {
  const response = await fetch(absoluteAssetUrl(url))

  if (!response.ok) {
    throw new Error(`Unable to download media from ${url}.`)
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? fallbackType,
  })
}

async function outputToBlob(output: unknown, fallbackType = "audio/wav") {
  if (output instanceof Blob) {
    return output
  }

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

  if (!outputUrl) {
    throw new Error("The voice model did not return an audio file.")
  }

  return fetchBlob(outputUrl, fallbackType)
}

function audioExtension(contentType: string | null) {
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) {
    return "mp3"
  }

  if (contentType?.includes("ogg")) {
    return "ogg"
  }

  if (contentType?.includes("mp4") || contentType?.includes("aac")) {
    return "m4a"
  }

  return "wav"
}

function videoExtension(contentType: string | null) {
  if (contentType?.includes("webm")) {
    return "webm"
  }

  if (contentType?.includes("quicktime")) {
    return "mov"
  }

  return "mp4"
}

async function generateChatterboxAudio(input: {
  prompt: string
  audio_prompt?: string
}) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Missing REPLICATE_API_TOKEN in the Trigger.dev environment.")
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run("resemble-ai/chatterbox", { input })

  return outputToBlob(output)
}

async function generateDeepgramAudio(model: string, text: string) {
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error("Missing DEEPGRAM_API_KEY in the Trigger.dev environment.")
  }

  const url = new URL("https://api.deepgram.com/v1/speak")
  url.searchParams.set("model", model)
  url.searchParams.set("encoding", "mp3")

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(details || "Deepgram did not generate audio.")
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? "audio/mpeg",
  })
}

async function uploadAudioToStorage({
  userId,
  videoId,
  audio,
}: {
  userId: string
  videoId: string
  audio: Blob
}) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from("avatars")
  const extension = audioExtension(audio.type)
  const objectKey = buildTtsAudioObjectKey(userId, videoId, `narration.${extension}`)
  const { error } = await bucket.upload(objectKey, audio)

  if (error) {
    throw new Error(error.message)
  }

  return bucket.getPublicUrl(objectKey)
}

async function uploadVideoToStorage({
  userId,
  videoId,
  video,
}: {
  userId: string
  videoId: string
  video: Blob
}) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from("avatars")
  const extension = videoExtension(video.type)
  const objectKey = buildAvatarVideoObjectKey(
    userId,
    videoId,
    `avatar-video.${extension}`
  )
  const { error } = await bucket.upload(objectKey, video)

  if (error) {
    throw new Error(error.message)
  }

  return bucket.getPublicUrl(objectKey)
}

function requireDomoApiKey() {
  const apiKey = process.env.DOMOAI_API_KEY

  if (!apiKey) {
    throw new Error("Missing DOMOAI_API_KEY in the Trigger.dev environment.")
  }

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

  if (!response.ok || !data) {
    throw new Error(`DomoAI request failed for ${path}.`)
  }

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

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => "")
    throw new Error(details || "Unable to upload media to DomoAI.")
  }

  return domoaiUri
}

async function createDomoTalkingAvatarTask(video: AvatarVideoRecord, image: Blob, audio: Blob) {
  const [imageUri, audioUri] = await Promise.all([
    uploadToDomo("avatar.png", image),
    uploadToDomo(`narration.${audioExtension(audio.type)}`, audio),
  ])
  const response = await domoRequest<DomoTaskResponse>("/video/talking-avatar", {
    method: "POST",
    body: JSON.stringify({
      prompt: "natural talking expression",
      image: { domoai_uri: imageUri },
      audio: { domoai_uri: audioUri },
      seconds: video.duration_seconds,
      aspect_ratio: video.screen_ratio,
      model: "talking-avatar-v1",
    }),
  })
  const taskId = response.data?.task_id ?? response.data?.id

  if (!taskId) {
    throw new Error(response.detail ?? response.message ?? "DomoAI did not return a task id.")
  }

  return taskId
}

function isDomoDone(status?: string) {
  return ["SUCCESS", "SUCCEEDED", "COMPLETED", "DONE"].includes(
    status?.toUpperCase() ?? ""
  )
}

function isDomoFailed(status?: string) {
  return ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(
    status?.toUpperCase() ?? ""
  )
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForDomoVideo(taskId: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const taskResult = await domoRequest<DomoTaskResponse>(`/tasks/${taskId}`)
    const taskData = taskResult.data
    const status = taskData?.status

    if (taskData?.output_videos?.[0]?.url && (!status || isDomoDone(status))) {
      return taskData
    }

    if (isDomoFailed(status)) {
      throw new Error(taskResult.detail ?? taskResult.message ?? "DomoAI generation failed.")
    }

    await sleep(10_000)
  }

  throw new Error("DomoAI video generation timed out.")
}

async function downloadDomoVideo(url: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Unable to download completed DomoAI video.")
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? "video/mp4",
  })
}

async function generateNarration(video: AvatarVideoRecord) {
  if (video.voice_type === "custom") {
    const voice = await loadCustomVoice(video.voice_id, video.user_id)

    return generateChatterboxAudio({
      prompt: video.script,
      audio_prompt: voice.sample_url,
    })
  }

  const voice = getDefaultVoice(video.voice_id)

  if (!voice) {
    throw new Error("Choose a valid default voice.")
  }

  return generateDeepgramAudio(voice.model, video.script)
}

function statusForStage(stage: ProgressStage): AvatarVideoStatus {
  if (stage === "preparing_avatar" || stage === "preparing_voice") {
    return "preparing"
  }

  if (stage === "generating_video") {
    return "generating"
  }

  if (stage === "processing_output") {
    return "processing"
  }

  if (stage === "uploading_to_storage") {
    return "uploading"
  }

  if (stage === "completed") {
    return "completed"
  }

  if (stage === "failed") {
    return "failed"
  }

  return "queued"
}

async function setDbStage(
  videoId: string,
  userId: string,
  stage: ProgressStage,
  progress: number,
  message: string
) {
  await setProgress(stage, progress, message)
  await updateAvatarVideo(videoId, userId, {
    status: statusForStage(stage),
    error_message: null,
  })
}

export const generateAvatarVideoTask = task({
  id: "generate-avatar-video",
  maxDuration: 1800,
  run: async (payload: GenerateAvatarVideoPayload) => {
    try {
      await setDbStage(payload.videoId, payload.userId, "queued", 5, "Avatar video generation is queued.")
      const video = await loadAvatarVideo(payload.videoId, payload.userId)

      if (!video.avatar_image_url) {
        throw new Error("The selected avatar does not have an image.")
      }

      await setDbStage(payload.videoId, payload.userId, "preparing_avatar", 15, "Preparing avatar image.")
      const avatarImage = await fetchBlob(video.avatar_image_url, "image/png")

      await setDbStage(payload.videoId, payload.userId, "preparing_voice", 30, "Preparing voice narration.")
      const narration = await generateNarration(video)
      await uploadAudioToStorage({
        userId: payload.userId,
        videoId: payload.videoId,
        audio: narration,
      })

      const enableDomo = process.env.DOMOAI_VIDEO_GENERATION_ENABLED !== "false"

      let videoUrl = video.avatar_image_url
      let mimeType = "image/png"
      let creditsUsed = null

      if (enableDomo) {
        await setDbStage(payload.videoId, payload.userId, "generating_video", 50, "Generating talking avatar video.")
        const domoTaskId = await createDomoTalkingAvatarTask(video, avatarImage, narration)
        await updateAvatarVideo(payload.videoId, payload.userId, {
          domo_task_id: domoTaskId,
        })

        await setDbStage(payload.videoId, payload.userId, "processing_output", 72, "Processing DomoAI output.")
        const domoVideo = await waitForDomoVideo(domoTaskId)
        const outputUrl = domoVideo.output_videos?.[0]?.url

        if (!outputUrl) {
          throw new Error("DomoAI did not return a completed video.")
        }

        const completedVideo = await downloadDomoVideo(outputUrl)

        await setDbStage(payload.videoId, payload.userId, "uploading_to_storage", 88, "Uploading final video to storage.")
        videoUrl = await uploadVideoToStorage({
          userId: payload.userId,
          videoId: payload.videoId,
          video: completedVideo,
        })
        mimeType = completedVideo.type || "video/mp4"
        creditsUsed = typeof domoVideo.credits === "number" ? domoVideo.credits : null
      } else {
        await setDbStage(payload.videoId, payload.userId, "generating_video", 50, "Skipping DomoAI video generation (using avatar image).")
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await setDbStage(payload.videoId, payload.userId, "processing_output", 75, "Preparing static avatar preview.")
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      await updateAvatarVideo(payload.videoId, payload.userId, {
        video_url: videoUrl,
        video_mime_type: mimeType,
        domo_credits: creditsUsed,
        status: "completed",
      })
      await setProgress("completed", 100, "Your avatar video is ready.")

      return {
        videoId: payload.videoId,
        videoUrl,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Avatar video generation failed."

      metadata.set("error", message)
      await setProgress("failed", 100, message)
      await updateAvatarVideo(payload.videoId, payload.userId, {
        status: "failed",
        error_message: message,
      })
      await refundCredits({
        userId: payload.userId,
        videoId: payload.videoId,
        credits: payload.creditsCharged,
      })

      throw error
    }
  },
})
