import type { AvatarRecord } from "@/lib/avatars"
import { calculateAvatarVideoCredits as calculateCreditsForDuration } from "@/lib/credits"
import type { VoiceType } from "@/lib/voices"

export type AvatarVideoStatus =
  | "queued"
  | "preparing"
  | "generating"
  | "processing"
  | "uploading"
  | "completed"
  | "failed"

export type AvatarVideoRatio = "16:9" | "9:16"

export type AvatarVideoDuration = 5 | 10 | 20 | 30 | 60

export type ScriptTone =
  | "professional"
  | "friendly"
  | "energetic"
  | "educational"
  | "promotional"

export type AvatarVideoRecord = {
  id: string
  user_id: string
  title: string
  script: string
  script_mode: "manual" | "ai"
  script_topic: string | null
  script_tone: ScriptTone | null
  avatar_id: string
  avatar_name: string
  avatar_style: string | null
  avatar_image_url: string | null
  voice_id: string
  voice_type: VoiceType
  voice_name: string
  duration_seconds: AvatarVideoDuration
  screen_ratio: AvatarVideoRatio
  credits_charged: number
  status: AvatarVideoStatus
  trigger_run_id: string | null
  domo_task_id: string | null
  domo_credits: number | null
  video_url: string | null
  video_mime_type: string | null
  thumbnail_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export const AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS = 2000

export const avatarVideoDurations = [5, 10, 20, 30, 60] as const

export const avatarVideoRatios = ["16:9", "9:16"] as const

export const avatarVideoTones = [
  "professional",
  "friendly",
  "energetic",
  "educational",
  "promotional",
] as const

export const avatarVideoCreditCosts: Record<AvatarVideoDuration, number> = {
  5: 40,
  10: 100,
  20: 200,
  30: 300,
  60: 600,
}

export function isAvatarVideoDuration(
  value: unknown
): value is AvatarVideoDuration {
  return avatarVideoDurations.includes(Number(value) as AvatarVideoDuration)
}

export function isAvatarVideoRatio(value: unknown): value is AvatarVideoRatio {
  return typeof value === "string" && avatarVideoRatios.includes(value as AvatarVideoRatio)
}

export function isScriptTone(value: unknown): value is ScriptTone {
  return typeof value === "string" && avatarVideoTones.includes(value as ScriptTone)
}

export function calculateAvatarVideoCredits(duration: AvatarVideoDuration) {
  return calculateCreditsForDuration(duration)
}

export function getAvatarImageForRatio(
  avatar: Pick<
    AvatarRecord,
    "image_16_9_url" | "image_9_16_url" | "source_image_url"
  >,
  ratio: AvatarVideoRatio
) {
  if (ratio === "9:16") {
    return (
      avatar.image_9_16_url ??
      avatar.image_16_9_url ??
      avatar.source_image_url
    )
  }

  return (
    avatar.image_16_9_url ??
    avatar.image_9_16_url ??
    avatar.source_image_url
  )
}

function safeFilename(filename: string, fallback: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return cleaned || fallback
}

export function buildAvatarVideoObjectKey(
  userId: string,
  videoId: string,
  filename = "avatar-video.mp4"
) {
  return `${userId}/avatar-videos/${videoId}/${safeFilename(
    filename,
    "avatar-video.mp4"
  )}`
}

export function formatAvatarVideoRatio(ratio: AvatarVideoRatio) {
  return ratio === "16:9" ? "16:9 Landscape" : "9:16 Vertical"
}

export function formatAvatarVideoDuration(duration: number) {
  return `${duration}s`
}
