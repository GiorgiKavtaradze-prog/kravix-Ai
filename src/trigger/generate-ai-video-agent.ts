import { GoogleGenAI } from "@google/genai"
import { metadata, task } from "@trigger.dev/sdk"
import Replicate from "replicate"

import {
  aiVideoAgentSceneCounts,
  buildAiVideoAgentObjectKey,
  type AiVideoAgentCaptionStyle,
  type AiVideoAgentDuration,
  type AiVideoAgentStatus,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
  type CaptionCue,
  type CaptionWordTiming,
  type RemotionSceneData,
} from "../../lib/ai-video-agent"
import { createInsForgeServerClient } from "../../lib/insforge/server"
import { getDefaultVoice } from "../../lib/voices"

type GenerateAiVideoAgentPayload = {
  projectId: string
  userId: string
  creditsCharged: number
}

type ProgressStage =
  | "queued"
  | "preparing_script"
  | "breaking_script_into_scenes"
  | "generating_prompts"
  | "generating_avatar_clips"
  | "generating_voiceover"
  | "generating_captions"
  | "fetching_or_generating_broll"
  | "creating_remotion_composition"
  | "saving_assets"
  | "preparing_preview"
  | "completed"
  | "failed"

type ScenePlan = {
  title: string
  summary: string
  startTime: number
  endTime: number
  voiceoverSegment: string
  captionText: string
  brollRequirement: string
  visualPrompt: string
  stockKeyword: string
  remotionData: RemotionSceneData
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

function statusForStage(stage: ProgressStage): AiVideoAgentStatus {
  if (stage === "completed") return "completed"
  if (stage === "failed") return "failed"
  if (stage === "creating_remotion_composition") return "rendering"
  if (
    stage === "generating_avatar_clips" ||
    stage === "generating_voiceover" ||
    stage === "generating_captions" ||
    stage === "fetching_or_generating_broll"
  ) {
    return "generating"
  }
  if (
    stage === "breaking_script_into_scenes" ||
    stage === "generating_prompts"
  ) {
    return "analyzing"
  }
  if (stage === "preparing_script" || stage === "saving_assets" || stage === "preparing_preview") {
    return "preparing"
  }

  return "queued"
}

async function setProgress(stage: ProgressStage, progress: number, message: string) {
  metadata.set("stage", stage).set("progress", progress).set("message", message)
  await metadata.flush()
}

async function updateProject(
  projectId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("ai_video_projects")
    .update(values)
    .eq("id", projectId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

async function setDbStage(
  projectId: string,
  userId: string,
  stage: ProgressStage,
  progress: number,
  message: string
) {
  await setProgress(stage, progress, message)
  await updateProject(projectId, userId, {
    status: statusForStage(stage),
    progress,
    progress_stage: stage,
    error_message: null,
  })
}

async function loadProject(projectId: string, userId: string) {
  const client = createInsForgeServerClient()
  const { data, error } = await client.database
    .from("ai_video_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to load the AI video project.")
  }

  return data as AiVideoProjectRecord
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
  projectId,
  credits,
}: {
  userId: string
  projectId: string
  credits: number
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
    description: "AI Video Agent generation failed",
    reference_id: projectId,
  })
}

function fallbackScript(topic: string, duration: AiVideoAgentDuration) {
  return [
    `Open with a sharp hook about ${topic}.`,
    `Explain the problem and why it matters in simple language.`,
    `Show the clearest benefit, add one concrete example, and keep the pace suitable for a ${duration}-second video.`,
    `Close with a confident next step for the viewer.`,
  ].join(" ")
}

async function ensureScript(project: AiVideoProjectRecord) {
  if (project.script.trim()) return project.script
  if (!project.script_topic) return project.script

  if (!process.env.GEMINI_API_KEY) {
    return fallbackScript(project.script_topic, project.duration_seconds)
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      {
        text: [
          "Write a polished spoken video script.",
          `Topic: ${project.script_topic}.`,
          `Duration: ${project.duration_seconds} seconds.`,
          "Use natural narration, no markdown, no scene labels, no stage directions.",
        ].join(" "),
      },
    ],
  })

  return response.text?.trim() || fallbackScript(project.script_topic, project.duration_seconds)
}

function splitEvenly(script: string, count: number) {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentences.length === 0) return Array.from({ length: count }, () => script)

  const groups = Array.from({ length: count }, () => [] as string[])
  sentences.forEach((sentence, index) => {
    groups[Math.min(count - 1, Math.floor((index / sentences.length) * count))].push(sentence)
  })

  return groups.map((group) => group.join(" ") || sentences[0])
}

function fallbackScenes(
  script: string,
  duration: AiVideoAgentDuration,
  captionStyle: AiVideoAgentCaptionStyle
): ScenePlan[] {
  const count = aiVideoAgentSceneCounts[duration]
  const segmentDuration = duration / count
  const segments = splitEvenly(script, count)

  return segments.map((segment, index) => ({
    title: index === 0 ? "Opening hook" : index === count - 1 ? "Final call to action" : `Scene ${index + 1}`,
    summary: segment.slice(0, 180),
    startTime: Number((index * segmentDuration).toFixed(2)),
    endTime: Number(((index + 1) * segmentDuration).toFixed(2)),
    voiceoverSegment: segment,
    captionText: segment,
    brollRequirement: "Support the narration with a clean, premium creator-style visual.",
    visualPrompt: `Premium editorial video b-roll for: ${segment}. No text, no watermark, cinematic lighting.`,
    stockKeyword: segment.split(/\s+/).slice(0, 4).join(" "),
    remotionData: {
      layout: index === 0 ? "avatar_intro" : "broll_focus",
      transition: index % 2 === 0 ? "fade" : "slide",
      captionPosition: captionStyle === "podcast" ? "bottom" : "center",
      visualDirection: "Use subtle motion, clean framing, and readable caption safe areas.",
      accentColor: index % 2 === 0 ? "#14b8a6" : "#f97316",
    },
  }))
}

function extractJson(value: string) {
  const match = value.match(/\[[\s\S]*\]/)
  return match?.[0] ?? value
}

function parseTimeToSeconds(timeVal: unknown): number {
  if (typeof timeVal === "number") {
    return isNaN(timeVal) ? 0 : timeVal
  }
  if (typeof timeVal !== "string") {
    return 0
  }

  const clean = timeVal.trim()
  // Check if it's already just a number string e.g. "5.5"
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean)
  }

  // Check for HH:MM:SS or MM:SS format
  const parts = clean.split(":")
  if (parts.length === 2) {
    // MM:SS or MM:SS.ms
    const mins = parseFloat(parts[0]) || 0
    const secs = parseFloat(parts[1]) || 0
    return mins * 60 + secs
  } else if (parts.length === 3) {
    // HH:MM:SS or HH:MM:SS.ms
    const hrs = parseFloat(parts[0]) || 0
    const mins = parseFloat(parts[1]) || 0
    const secs = parseFloat(parts[2]) || 0
    return hrs * 3600 + mins * 60 + secs
  }

  const parsed = parseFloat(clean)
  return isNaN(parsed) ? 0 : parsed
}

async function analyzeScenes(project: AiVideoProjectRecord, script: string) {
  const fallback = fallbackScenes(script, project.duration_seconds, project.caption_style)

  if (!process.env.GEMINI_API_KEY) return fallback

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const count = aiVideoAgentSceneCounts[project.duration_seconds]
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          text: [
            "Return only valid JSON array. Break this video script into scene objects.",
            `Scene count: ${count}. Total duration: ${project.duration_seconds} seconds.`,
            "Each scene must include title, summary, startTime (as a number in seconds, e.g., 0 or 5.5), endTime (as a number in seconds, e.g., 5.5 or 10), voiceoverSegment, captionText, brollRequirement, visualPrompt, stockKeyword, remotionData.",
            "remotionData must include layout, transition, captionPosition, visualDirection, accentColor.",
            `Script: ${script}`,
          ].join(" "),
        },
      ],
    })
    const parsed = JSON.parse(extractJson(response.text ?? "")) as Partial<ScenePlan>[]

    if (!Array.isArray(parsed) || parsed.length === 0) return fallback

    return fallback.map((scene, index) => {
      const p = parsed[index] ?? {}
      const startTime = p.startTime !== undefined ? parseTimeToSeconds(p.startTime) : scene.startTime
      const endTime = p.endTime !== undefined ? parseTimeToSeconds(p.endTime) : scene.endTime
      return {
        ...scene,
        ...p,
        startTime,
        endTime,
        remotionData: {
          ...scene.remotionData,
          ...(p.remotionData ?? {}),
        },
      }
    })
  } catch {
    return fallback
  }
}

async function saveScenes(project: AiVideoProjectRecord, scenes: ScenePlan[]) {
  const client = createInsForgeServerClient()
  const rows = scenes.map((scene, index) => ({
    id: crypto.randomUUID(),
    project_id: project.id,
    user_id: project.user_id,
    scene_index: index,
    title: scene.title,
    summary: scene.summary,
    start_time: scene.startTime,
    end_time: scene.endTime,
    voiceover_segment: scene.voiceoverSegment,
    caption_text: scene.captionText,
    broll_requirement: scene.brollRequirement,
    visual_prompt: scene.visualPrompt,
    stock_keyword: scene.stockKeyword,
    remotion_data: scene.remotionData,
  }))
  const { data, error } = await client.database
    .from("ai_video_scenes")
    .insert(rows)
    .select("*")

  if (error) throw new Error(error.message)

  return (data ?? []) as AiVideoSceneRecord[]
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

function absoluteAssetUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!appUrl) {
    throw new Error("Set NEXT_PUBLIC_APP_URL so Trigger.dev can load local media assets.")
  }

  return new URL(url, appUrl).toString()
}

async function fetchBlob(url: string, fallbackType: string) {
  const response = await fetch(absoluteAssetUrl(url))

  if (!response.ok) throw new Error(`Unable to download media from ${url}.`)

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? fallbackType,
  })
}

function extensionForMime(contentType: string | null, fallback: string) {
  if (contentType?.includes("jpeg")) return "jpg"
  if (contentType?.includes("png")) return "png"
  if (contentType?.includes("webp")) return "webp"
  if (contentType?.includes("mpeg")) return "mp3"
  if (contentType?.includes("wav")) return "wav"
  if (contentType?.includes("webm")) return "webm"
  if (contentType?.includes("json")) return "json"
  if (contentType?.includes("mp4")) return "mp4"
  return fallback
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

async function createDomoTalkingAvatarTask({
  image,
  audio,
  seconds,
  screenSize,
}: {
  image: Blob
  audio: Blob
  seconds: number
  screenSize: string
}) {
  const [imageUri, audioUri] = await Promise.all([
    uploadToDomo("avatar.png", image),
    uploadToDomo(`avatar-audio.${extensionForMime(audio.type, "mp3")}`, audio),
  ])
  const response = await domoRequest<DomoTaskResponse>("/video/talking-avatar", {
    method: "POST",
    body: JSON.stringify({
      prompt: "natural presenter expression for a polished AI video",
      image: { domoai_uri: imageUri },
      audio: { domoai_uri: audioUri },
      seconds,
      aspect_ratio: screenSize,
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
  return ["SUCCESS", "SUCCEEDED", "COMPLETED", "DONE"].includes(status?.toUpperCase() ?? "")
}

function isDomoFailed(status?: string) {
  return ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(status?.toUpperCase() ?? "")
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

    await sleep(10_000)
  }

  throw new Error("DomoAI avatar clip generation timed out.")
}

async function generateDefaultVoiceover(project: AiVideoProjectRecord, script: string) {
  const voice = getDefaultVoice(project.voice_id)
  if (!voice) throw new Error("Choose a valid default voice.")
  if (!process.env.DEEPGRAM_API_KEY) {
    return new Blob([script], { type: "text/plain" })
  }

  const url = new URL("https://api.deepgram.com/v1/speak")
  url.searchParams.set("model", voice.model)
  url.searchParams.set("encoding", "mp3")
  url.searchParams.set("speed", "0.9") // Natural, professional pacing (10% slower)

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: script }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(details || "Deepgram did not generate voiceover audio.")
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? "audio/mpeg",
  })
}

async function generateCustomVoiceover(project: AiVideoProjectRecord, script: string) {
  if (!process.env.REPLICATE_API_TOKEN) {
    return new Blob([script], { type: "text/plain" })
  }

  const voice = await loadCustomVoice(project.voice_id, project.user_id)
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run("resemble-ai/chatterbox", {
    input: {
      prompt: script,
      audio_prompt: voice.sample_url,
    },
  })

  return outputToBlob(output, "audio/wav")
}

async function generateVoiceover(project: AiVideoProjectRecord, script: string) {
  return project.voice_type === "custom"
    ? generateCustomVoiceover(project, script)
    : generateDefaultVoiceover(project, script)
}

async function transcribeCaptions({
  project,
  voiceoverUrl,
  scenes,
}: {
  project: AiVideoProjectRecord
  voiceoverUrl: string
  scenes: AiVideoSceneRecord[]
}): Promise<CaptionCue[]> {
  const fallback = () => scenes.map((scene) => ({
    text: scene.caption_text,
    start: Number(scene.start_time),
    end: Number(scene.end_time),
    style: project.caption_style,
  })) satisfies CaptionCue[]

  if (!process.env.DEEPGRAM_API_KEY || voiceoverUrl.endsWith(".txt")) {
    return fallback()
  }

  try {
    const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&words=true", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: voiceoverUrl }),
    })

    if (!response.ok) {
      return fallback()
    }

    const data = (await response.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string
            words?: Array<{ word?: string; start?: number; end?: number }>
          }>
        }>
        utterances?: Array<{
          transcript?: string
          start?: number
          end?: number
          words?: Array<{ word?: string; start?: number; end?: number }>
        }>
      }
    }

    let utterances = data.results?.utterances ?? []
    const allTranscribedWords = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? []

    // Safeguard: Synthesize utterances from the main words array if 'utterances' is empty
    if (!utterances.length && allTranscribedWords.length > 0) {
      const synthesized: Array<{
        transcript?: string
        start?: number
        end?: number
        words?: Array<{ word?: string; start?: number; end?: number }>
      }> = []
      let currentChunk: typeof allTranscribedWords = []

      for (let i = 0; i < allTranscribedWords.length; i++) {
        const word = allTranscribedWords[i]
        currentChunk.push(word)

        const nextWord = allTranscribedWords[i + 1]
        const isLastWord = i === allTranscribedWords.length - 1
        const hasGap = nextWord && typeof nextWord.start === "number" && typeof word.end === "number" && (nextWord.start - word.end) > 0.8
        const isChunkTooLong = currentChunk.length >= 8

        if (isLastWord || hasGap || isChunkTooLong) {
          synthesized.push({
            start: currentChunk[0].start ?? 0,
            end: currentChunk[currentChunk.length - 1].end ?? 0,
            transcript: currentChunk.map((w) => w.word ?? "").join(" "),
            words: currentChunk,
          })
          currentChunk = []
        }
      }
      utterances = synthesized
    }

    if (!utterances.length) {
      return fallback()
    }

    return utterances.map((utterance) => {
      const uStart = utterance.start ?? 0
      const uEnd = utterance.end ?? 0

      // Filter words for this utterance from the complete list of words if utterance.words is missing
      const rawWords = utterance.words ?? allTranscribedWords.filter(
        (word) => typeof word.start === "number" && typeof word.end === "number" && word.start >= uStart - 0.05 && word.end <= uEnd + 0.05
      )

      return {
        text: utterance.transcript ?? "",
        start: uStart,
        end: uEnd,
        style: project.caption_style,
        words: rawWords.map((word) => ({
          word: word.word ?? "",
          start: word.start ?? 0,
          end: word.end ?? 0,
        })),
      }
    })
  } catch (error) {
    console.error("Failed to transcribe captions with Deepgram:", error)
    return fallback()
  }
}

async function generateImageBroll(project: AiVideoProjectRecord, scene: AiVideoSceneRecord) {
  if (!process.env.GEMINI_API_KEY) return null

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          text: [
            scene.visual_prompt ?? scene.summary,
            "Create a high-quality cinematic b-roll image.",
            "No text, no captions, no watermark, no logo.",
          ].join(" "),
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: project.screen_size,
          imageSize: "1K",
        },
      },
    })
    const imagePart = response.candidates?.[0]?.content?.parts?.find(
      (part) => "inlineData" in part && part.inlineData?.data
    )
    const base64Data =
      imagePart && "inlineData" in imagePart
        ? imagePart.inlineData?.data
        : null

    if (!base64Data) return null

    const mimeType = "image/png"
    const blob = new Blob([Buffer.from(base64Data, "base64")], {
      type: mimeType,
    })
    const extension = "png"
    const url = await uploadBlob({
      userId: project.user_id,
      projectId: project.id,
      filename: `scene-${scene.scene_index + 1}-broll.${extension}`,
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
      metadata: { prompt: scene.visual_prompt },
    })
  } catch (error) {
    console.error(`Failed to generate image b-roll for scene ${scene.scene_index + 1}:`, error)
    return null
  }
}

async function fetchStockBroll(project: AiVideoProjectRecord, scene: AiVideoSceneRecord) {
  if (!process.env.PIXABAY_API_KEY) return null

  try {
    const url = new URL("https://pixabay.com/api/videos/")
    url.searchParams.set("key", process.env.PIXABAY_API_KEY)
    url.searchParams.set("q", scene.stock_keyword ?? scene.title)
    url.searchParams.set("per_page", "3")
    url.searchParams.set("safesearch", "true")

    const response = await fetch(url)
    if (!response.ok) return null

    const data = (await response.json()) as {
      hits?: Array<{ videos?: { medium?: { url?: string }; small?: { url?: string } }; picture_id?: string }>
    }
    const hit = data.hits?.[0]
    let mediaUrl = hit?.videos?.medium?.url ?? hit?.videos?.small?.url ?? null
    let assetType: AiVideoAssetRecord["asset_type"] = "broll_video"
    let mimeType = "video/mp4"

    if (!mediaUrl) {
      // Fallback to stock image search
      const imgUrl = new URL("https://pixabay.com/api/")
      imgUrl.searchParams.set("key", process.env.PIXABAY_API_KEY)
      imgUrl.searchParams.set("q", scene.stock_keyword ?? scene.title)
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

    if (!mediaUrl) return null

    return saveAsset({
      projectId: project.id,
      userId: project.user_id,
      sceneId: scene.id,
      assetType,
      url: mediaUrl,
      mimeType,
      provider: "pixabay",
      metadata: { keyword: scene.stock_keyword, pictureId: hit?.picture_id },
    })
  } catch (error) {
    console.error(`Failed to fetch stock b-roll for scene ${scene.scene_index + 1}:`, error)
    return null
  }
}

async function generateVideoBroll(project: AiVideoProjectRecord, scene: AiVideoSceneRecord) {
  if (!process.env.REPLICATE_API_TOKEN) return null

  try {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    const output = await replicate.run("wan-video/wan-2.2-t2v-fast", {
      input: {
        prompt: scene.visual_prompt ?? scene.summary,
      },
    })
    const blob = await outputToBlob(output, "video/mp4")
    const extension = extensionForMime(blob.type, "mp4")
    const url = await uploadBlob({
      userId: project.user_id,
      projectId: project.id,
      filename: `scene-${scene.scene_index + 1}-ai-video.${extension}`,
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
      metadata: { prompt: scene.visual_prompt, model: "wan-video/wan-2.2-t2v-fast" },
    })
  } catch (error) {
    console.error(`Failed to generate video b-roll for scene ${scene.scene_index + 1}:`, error)
    return null
  }
}

function avatarPlacements(duration: AiVideoAgentDuration, scenes: AiVideoSceneRecord[]) {
  if (duration === 30) {
    return [{ start: 0, end: 5, sceneId: scenes[0]?.id }]
  }

  if (duration === 60) {
    return [
      { start: 0, end: 5, sceneId: scenes[0]?.id },
      { start: 30, end: 35, sceneId: scenes[Math.floor(scenes.length / 2)]?.id },
    ]
  }

  return [
    { start: 0, end: 5, sceneId: scenes[0]?.id },
    { start: Math.round(duration / 2), end: Math.round(duration / 2) + 5, sceneId: scenes[Math.floor(scenes.length / 2)]?.id },
    { start: Math.max(duration - 18, 0), end: Math.max(duration - 13, 5), sceneId: scenes[scenes.length - 1]?.id },
  ]
}

async function generateAvatarClipAsset({
  project,
  scene,
  start,
  end,
  index,
}: {
  project: AiVideoProjectRecord
  scene: AiVideoSceneRecord | undefined
  start: number
  end: number
  index: number
}) {
  const enableDomo = process.env.DOMOAI_VIDEO_GENERATION_ENABLED !== "false"

  if (!enableDomo || !process.env.DOMOAI_API_KEY || !project.avatar_image_url || !scene) {
    return saveAsset({
      projectId: project.id,
      userId: project.user_id,
      sceneId: scene?.id ?? null,
      assetType: "avatar_clip",
      url: project.avatar_image_url,
      mimeType: "image/png",
      provider: "avatar-placement",
      metadata: {
        start,
        end,
        index,
        reason: !enableDomo
          ? "DomoAI video generation is disabled by config; using avatar image."
          : "DomoAI key unavailable or no avatar image; saved timeline placement.",
      },
    })
  }

  try {
    const [avatarImage, narration] = await Promise.all([
      fetchBlob(project.avatar_image_url, "image/png"),
      generateVoiceover(project, scene.voiceover_segment),
    ])

    if (narration.type === "text/plain") {
      throw new Error("No audio provider available for the avatar clip.")
    }

    const taskId = await createDomoTalkingAvatarTask({
      image: avatarImage,
      audio: narration,
      seconds: Math.max(1, Math.round(end - start)),
      screenSize: project.screen_size,
    })
    const outputUrl = await waitForDomoVideo(taskId)
    const clip = await fetchBlob(outputUrl, "video/mp4")
    const extension = extensionForMime(clip.type, "mp4")
    const clipUrl = await uploadBlob({
      userId: project.user_id,
      projectId: project.id,
      filename: `avatar-clip-${index + 1}.${extension}`,
      blob: clip,
    })

    return saveAsset({
      projectId: project.id,
      userId: project.user_id,
      sceneId: scene.id,
      assetType: "avatar_clip",
      url: clipUrl,
      mimeType: clip.type || "video/mp4",
      provider: "domoai",
      metadata: { start, end, index, taskId },
    })
  } catch (error) {
    return saveAsset({
      projectId: project.id,
      userId: project.user_id,
      sceneId: scene.id,
      assetType: "avatar_clip",
      url: project.avatar_image_url,
      mimeType: "image/png",
      provider: "avatar-placement",
      metadata: {
        start,
        end,
        index,
        fallbackError: error instanceof Error ? error.message : "Unable to generate avatar clip.",
      },
    })
  }
}

async function saveAvatarClipAssets(project: AiVideoProjectRecord, scenes: AiVideoSceneRecord[]) {
  const placements = avatarPlacements(project.duration_seconds, scenes)

  return Promise.all(
    placements.map((placement, index) =>
      generateAvatarClipAsset({
        project,
        scene: scenes.find((scene) => scene.id === placement.sceneId),
        start: placement.start,
        end: placement.end,
        index,
      })
    )
  )
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

async function generateBrollAssets(
  project: AiVideoProjectRecord,
  scenes: AiVideoSceneRecord[]
) {
  const generated: AiVideoAssetRecord[] = []

  for (const scene of scenes) {
    let asset: AiVideoAssetRecord | null = null

    if (project.broll_style === "ai_images") {
      asset = await generateImageBroll(project, scene)
    } else if (project.broll_style === "stock") {
      asset = await fetchStockBroll(project, scene)
    } else if (project.broll_style === "ai_video") {
      asset = await generateVideoBroll(project, scene)
    } else {
      const source = fallbackIllustrationCode(scene, scene.visual_prompt || scene.summary)
      const blob = new Blob([source], { type: "text/tsx" })
      const url = await uploadBlob({
        userId: project.user_id,
        projectId: project.id,
        filename: `scene-${scene.scene_index + 1}-animation.tsx`,
        blob,
      })

      asset = await saveAsset({
        projectId: project.id,
        userId: project.user_id,
        sceneId: scene.id,
        assetType: "remotion_component",
        url,
        mimeType: "text/tsx",
        provider: "remotion-editor",
        metadata: {
          prompt: scene.visual_prompt,
          editMode: "illustration",
          componentName: "SceneAnimation",
          illustrationReactCode: source,
        },
      })
    }

    if (!asset) {
      asset = await saveAsset({
        projectId: project.id,
        userId: project.user_id,
        sceneId: scene.id,
        assetType: project.broll_style === "ai_video" ? "ai_video" : "broll_image",
        url: project.avatar_image_url,
        mimeType: "image/png",
        provider: "fallback",
        metadata: {
          prompt: scene.visual_prompt,
          keyword: scene.stock_keyword,
          reason: "Provider key unavailable or provider returned no media.",
        },
      })
    }

    generated.push(asset)
  }

  return generated
}

async function saveJsonAsset({
  project,
  filename,
  assetType,
  value,
}: {
  project: AiVideoProjectRecord
  filename: string
  assetType: AiVideoAssetRecord["asset_type"]
  value: unknown
}) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  })
  const url = await uploadBlob({
    userId: project.user_id,
    projectId: project.id,
    filename,
    blob,
  })

  return saveAsset({
    projectId: project.id,
    userId: project.user_id,
    assetType,
    url,
    mimeType: "application/json",
    provider: "remotion",
    metadata: { filename },
  })
}

function buildComposition({
  project,
  scenes,
  assets,
  captions,
}: {
  project: AiVideoProjectRecord
  scenes: AiVideoSceneRecord[]
  assets: AiVideoAssetRecord[]
  captions: CaptionCue[]
}) {
  return {
    id: project.id,
    title: project.title,
    durationSeconds: project.duration_seconds,
    fps: 30,
    width: project.screen_size === "16:9" ? 1920 : 1080,
    height: project.screen_size === "16:9" ? 1080 : 1920,
    screenSize: project.screen_size,
    captionStyle: project.caption_style,
    brollStyle: project.broll_style,
    avatar: {
      id: project.avatar_id,
      name: project.avatar_name,
      imageUrl: project.avatar_image_url,
      placements: avatarPlacements(project.duration_seconds, scenes),
    },
    voice: {
      id: project.voice_id,
      type: project.voice_type,
      name: project.voice_name,
      voiceoverUrl: project.voiceover_url,
    },
    scenes,
    assets,
    captions,
    transitions: scenes.map((scene) => ({
      sceneId: scene.id,
      transition: (scene.remotion_data as RemotionSceneData | null)?.transition ?? "fade",
    })),
  }
}

export const generateAiVideoAgentTask = task({
  id: "generate-ai-video-agent",
  maxDuration: 3600,
  run: async (payload: GenerateAiVideoAgentPayload) => {
    try {
      await setDbStage(payload.projectId, payload.userId, "queued", 3, "AI Video Agent generation is queued.")
      let project = await loadProject(payload.projectId, payload.userId)

      await setDbStage(payload.projectId, payload.userId, "preparing_script", 10, "Preparing script.")
      const script = await ensureScript(project)
      if (script !== project.script) {
        await updateProject(project.id, project.user_id, { script })
        project = { ...project, script }
      }

      await setDbStage(payload.projectId, payload.userId, "breaking_script_into_scenes", 20, "Breaking script into scenes.")
      const scenePlans = await analyzeScenes(project, script)
      const scenes = await saveScenes(project, scenePlans)

      await setDbStage(payload.projectId, payload.userId, "generating_prompts", 30, "Generating visual prompts and Remotion scene plans.")

      await setDbStage(payload.projectId, payload.userId, "generating_avatar_clips", 40, "Placing avatar clips on the timeline.")
      const avatarAssets = await saveAvatarClipAssets(project, scenes)

      await setDbStage(payload.projectId, payload.userId, "generating_voiceover", 52, "Generating voiceover.")
      const voiceover = await generateVoiceover(project, script)
      const voiceExt = extensionForMime(voiceover.type, "mp3")
      const voiceoverUrl = await uploadBlob({
        userId: project.user_id,
        projectId: project.id,
        filename: `voiceover.${voiceExt}`,
        blob: voiceover,
      })
      await saveAsset({
        projectId: project.id,
        userId: project.user_id,
        assetType: "voiceover",
        url: voiceoverUrl,
        mimeType: voiceover.type,
        provider: project.voice_type === "custom" ? "replicate" : "deepgram",
      })
      await updateProject(project.id, project.user_id, { voiceover_url: voiceoverUrl })
      project = { ...project, voiceover_url: voiceoverUrl }

      await setDbStage(payload.projectId, payload.userId, "generating_captions", 64, "Generating accurate captions.")
      const captions = await transcribeCaptions({ project, voiceoverUrl, scenes })

      // Align scene timings to the transcribed words
      const allWords: Array<{ word: string; start: number; end: number }> = []
      for (const cue of captions) {
        if (cue.words) {
          allWords.push(...cue.words)
        }
      }

      // Split the entire script into original words
      const originalWords = script.split(/\s+/).filter(Boolean)

      // Align original words sequentially to the transcribed timings (1-to-1 sequential mapping)
      const timedWords = originalWords.map((word, idx) => {
        const matchingTranscribed = allWords[idx]
        if (matchingTranscribed) {
          return {
            word,
            start: matchingTranscribed.start,
            end: matchingTranscribed.end,
          }
        }

        // Extrapolate timing smoothly if Deepgram missed a word or ended early
        const prevWord = idx > 0 ? allWords[idx - 1] : null
        const start = prevWord ? prevWord.end + 0.05 : idx * 0.3
        const end = start + 0.3
        return {
          word,
          start,
          end,
        }
      })

      // Align scene timings to the mapped words (completely eliminating gaps and overlaps)
      let currentWordIdx = 0
      const alignedScenes = scenes.map((scene, index) => {
        const sceneWordCount = (scene.voiceover_segment || scene.caption_text || "")
          .split(/\s+/)
          .filter(Boolean).length

        const sceneWords = timedWords.slice(currentWordIdx, currentWordIdx + sceneWordCount)
        currentWordIdx += sceneWordCount

        // Set startTime of scene
        const startTime = index === 0 ? 0 : (sceneWords[0]?.start ?? Number(scene.start_time))
        // Set endTime of scene
        const endTime = sceneWords[sceneWords.length - 1]?.end ?? Number(scene.end_time)

        return {
          ...scene,
          start_time: startTime,
          end_time: endTime,
        }
      })

      // Make scene timings perfectly contiguous so there are zero flickers or black screens
      for (let i = 0; i < alignedScenes.length - 1; i++) {
        alignedScenes[i].end_time = alignedScenes[i + 1].start_time
      }

      // Save aligned scene times in the database
      const clientForSync = createInsForgeServerClient()
      for (const updatedScene of alignedScenes) {
        await clientForSync.database
          .from("ai_video_scenes")
          .update({
            start_time: updatedScene.start_time,
            end_time: updatedScene.end_time,
          })
          .eq("id", updatedScene.id)
      }

      // Generate accurate, chunked caption cues (groups of 5 words) for natural reading pacing
      const finalCaptions: CaptionCue[] = []
      currentWordIdx = 0
      alignedScenes.forEach((scene) => {
        const sceneWordCount = (scene.voiceover_segment || scene.caption_text || "")
          .split(/\s+/)
          .filter(Boolean).length

        const sceneWords = timedWords.slice(currentWordIdx, currentWordIdx + sceneWordCount)
        currentWordIdx += sceneWordCount

        // Chunk words in groups of 5
        const chunkSize = 5
        for (let i = 0; i < sceneWords.length; i += chunkSize) {
          const chunk = sceneWords.slice(i, i + chunkSize)
          if (chunk.length === 0) continue

          finalCaptions.push({
            text: chunk.map((w) => w.word).join(" "),
            start: chunk[0].start,
            end: chunk[chunk.length - 1].end,
            style: project.caption_style,
            words: chunk,
          })
        }
      })

      // Save final, aligned captions
      await saveJsonAsset({
        project,
        filename: "captions.json",
        assetType: "captions",
        value: finalCaptions,
      })
      await updateProject(project.id, project.user_id, { captions: finalCaptions })

      await setDbStage(payload.projectId, payload.userId, "fetching_or_generating_broll", 74, "Fetching or generating B-roll.")
      const brollAssets = await generateBrollAssets(project, alignedScenes)
      const allAssets = [...avatarAssets, ...brollAssets]

      await setDbStage(payload.projectId, payload.userId, "creating_remotion_composition", 86, "Creating Remotion composition.")
      const composition = buildComposition({
        project,
        scenes: alignedScenes,
        assets: allAssets,
        captions: finalCaptions,
      })
      const compositionAsset = await saveJsonAsset({
        project,
        filename: "composition.json",
        assetType: "composition",
        value: composition,
      })

      await setDbStage(payload.projectId, payload.userId, "saving_assets", 92, "Saving generated assets.")
      const thumbnailUrl =
        brollAssets.find((asset) => asset.url)?.url ??
        project.avatar_image_url ??
        null

      await setDbStage(payload.projectId, payload.userId, "preparing_preview", 97, "Preparing preview.")
      await updateProject(project.id, project.user_id, {
        composition_data: composition,
        preview_url: compositionAsset.url,
        thumbnail_url: thumbnailUrl,
        status: "completed",
        progress: 100,
        progress_stage: "completed",
      })
      await setProgress("completed", 100, "Your AI Video Agent project is ready.")

      return {
        projectId: project.id,
        previewUrl: compositionAsset.url,
        thumbnailUrl,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI Video Agent generation failed."

      metadata.set("error", message)
      await setProgress("failed", 100, message)
      await updateProject(payload.projectId, payload.userId, {
        status: "failed",
        progress: 100,
        progress_stage: "failed",
        error_message: message,
      })
      await refundCredits({
        userId: payload.userId,
        projectId: payload.projectId,
        credits: payload.creditsCharged,
      })

      throw error
    }
  },
})
