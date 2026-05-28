import type { AvatarRecord } from "@/lib/avatars"
import type { VoiceType } from "@/lib/voices"

export type AiVideoAgentStatus =
  | "queued"
  | "preparing"
  | "analyzing"
  | "generating"
  | "rendering"
  | "completed"
  | "failed"

export type AiVideoAgentDuration = 30 | 60 | 90 | 120
export type AiVideoAgentScreenSize = "16:9" | "9:16"
export type AiVideoAgentScriptMode = "manual" | "topic"
export type AiVideoAgentBrollStyle =
  | "ai_images"
  | "stock"
  | "ai_video"
  | "illustration_animation"

export type AiVideoAgentCaptionStyle =
  | "bold_subtitle"
  | "minimal_clean"
  | "podcast"
  | "tiktok_viral"
  | "gradient_highlight"
  | "word_by_word"

export type AiVideoAgentAssetType =
  | "avatar_clip"
  | "broll_image"
  | "broll_video"
  | "ai_video"
  | "voiceover"
  | "captions"
  | "composition"
  | "remotion_component"
  | "final_render"

export type CaptionWordTiming = {
  word: string
  start: number
  end: number
}

export type CaptionCue = {
  text: string
  start: number
  end: number
  style: AiVideoAgentCaptionStyle
  words?: CaptionWordTiming[]
}

export type RemotionSceneData = {
  layout: "avatar_intro" | "broll_focus" | "split_avatar" | "illustration"
  transition: "cut" | "fade" | "slide" | "zoom"
  captionPosition: "top" | "center" | "bottom"
  visualDirection: string
  accentColor: string
}

export type AiVideoSceneRecord = {
  id: string
  project_id: string
  user_id: string
  scene_index: number
  title: string
  summary: string
  start_time: number
  end_time: number
  voiceover_segment: string
  caption_text: string
  broll_requirement: string
  visual_prompt: string | null
  stock_keyword: string | null
  remotion_data: RemotionSceneData | Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AiVideoAssetRecord = {
  id: string
  project_id: string
  scene_id: string | null
  user_id: string
  asset_type: AiVideoAgentAssetType
  url: string | null
  mime_type: string | null
  provider: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AiVideoProjectRecord = {
  id: string
  user_id: string
  title: string
  script: string
  script_mode: AiVideoAgentScriptMode
  script_topic: string | null
  duration_seconds: AiVideoAgentDuration
  screen_size: AiVideoAgentScreenSize
  avatar_id: string
  avatar_name: string
  avatar_style: string | null
  avatar_image_url: string | null
  voice_id: string
  voice_type: VoiceType
  voice_name: string
  caption_style: AiVideoAgentCaptionStyle
  broll_style: AiVideoAgentBrollStyle
  credits_charged: number
  status: AiVideoAgentStatus
  progress: number
  progress_stage: string | null
  trigger_run_id: string | null
  voiceover_url: string | null
  captions: CaptionCue[] | null
  composition_data: Record<string, unknown> | null
  preview_url: string | null
  final_video_url: string | null
  final_video_mime_type: string | null
  thumbnail_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type AiVideoProjectWithRelations = AiVideoProjectRecord & {
  scenes: AiVideoSceneRecord[]
  assets: AiVideoAssetRecord[]
}

export const aiVideoAgentDurations = [30, 60, 90, 120] as const
export const aiVideoAgentScreenSizes = ["16:9", "9:16"] as const
export const aiVideoAgentScriptModes = ["manual", "topic"] as const
export const aiVideoAgentBrollStyles = [
  "ai_images",
  "stock",
  "ai_video",
  "illustration_animation",
] as const
export const aiVideoAgentCaptionStyles = [
  "bold_subtitle",
  "minimal_clean",
  "podcast",
  "tiktok_viral",
  "gradient_highlight",
  "word_by_word",
] as const

export const aiVideoAgentSceneCounts: Record<AiVideoAgentDuration, number> = {
  30: 4,
  60: 6,
  90: 9,
  120: 12,
}

export const AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS = 8000

export function isAiVideoAgentDuration(
  value: unknown
): value is AiVideoAgentDuration {
  return aiVideoAgentDurations.includes(Number(value) as AiVideoAgentDuration)
}

export function isAiVideoAgentScreenSize(
  value: unknown
): value is AiVideoAgentScreenSize {
  return (
    typeof value === "string" &&
    aiVideoAgentScreenSizes.includes(value as AiVideoAgentScreenSize)
  )
}

export function isAiVideoAgentBrollStyle(
  value: unknown
): value is AiVideoAgentBrollStyle {
  return (
    typeof value === "string" &&
    aiVideoAgentBrollStyles.includes(value as AiVideoAgentBrollStyle)
  )
}

export function isAiVideoAgentCaptionStyle(
  value: unknown
): value is AiVideoAgentCaptionStyle {
  return (
    typeof value === "string" &&
    aiVideoAgentCaptionStyles.includes(value as AiVideoAgentCaptionStyle)
  )
}

export function calculateAiVideoAgentCredits({
  duration,
  brollStyle,
}: {
  duration: AiVideoAgentDuration
  brollStyle: AiVideoAgentBrollStyle
}) {
  const scenes = aiVideoAgentSceneCounts[duration]

  if (brollStyle === "stock") {
    return 0
  }

  if (brollStyle === "ai_images") {
    return scenes * 5
  }

  if (brollStyle === "ai_video") {
    return scenes * 10
  }

  return scenes * 7
}

export function formatAiVideoDuration(duration: number) {
  return duration < 60 ? `${duration}s` : `${Math.round(duration / 60)} min`
}

export function formatAiVideoScreenSize(screenSize: AiVideoAgentScreenSize) {
  return screenSize === "16:9" ? "16:9 Landscape" : "9:16 Vertical"
}

export function formatAiVideoBrollStyle(style: AiVideoAgentBrollStyle) {
  const labels: Record<AiVideoAgentBrollStyle, string> = {
    ai_images: "AI Generated Images",
    stock: "Stock Images/Videos",
    ai_video: "AI Generated Video",
    illustration_animation: "AI Illustration Animation",
  }

  return labels[style]
}

export function formatAiVideoCaptionStyle(style: AiVideoAgentCaptionStyle) {
  const labels: Record<AiVideoAgentCaptionStyle, string> = {
    bold_subtitle: "Bold subtitle",
    minimal_clean: "Minimal clean",
    podcast: "Podcast",
    tiktok_viral: "TikTok viral",
    gradient_highlight: "Gradient highlight",
    word_by_word: "Word-by-word",
  }

  return labels[style]
}

export function getAvatarImageForAiVideo(
  avatar: Pick<
    AvatarRecord,
    "image_16_9_url" | "image_9_16_url" | "source_image_url"
  >,
  screenSize: AiVideoAgentScreenSize
) {
  if (screenSize === "9:16") {
    return avatar.image_9_16_url ?? avatar.image_16_9_url ?? avatar.source_image_url
  }

  return avatar.image_16_9_url ?? avatar.image_9_16_url ?? avatar.source_image_url
}

function safeFilename(filename: string, fallback: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return cleaned || fallback
}

export function buildAiVideoAgentObjectKey(
  userId: string,
  projectId: string,
  filename: string
) {
  return `${userId}/ai-video-agent/${projectId}/${safeFilename(filename, "asset")}`
}
