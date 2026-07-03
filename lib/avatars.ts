export const avatarStyles = [
  "Podcast",
  "Casual",
  "3D Cartoon",
  "Stylized",
] as const
export type AvatarStyle = (typeof avatarStyles)[number]
export type AvatarSource = "default" | "upload" | "ai"
export type AvatarStatus =
  | "ready"
  | "queued"
  | "generating"
  | "completed"
  | "failed"
export type AvatarRecord = {
  id: string
  user_id: string
  name: string
  source: AvatarSource
  style: AvatarStyle | null
  prompt: string | null
  source_image_url: string | null
  image_16_9_url: string | null
  image_9_16_url: string | null
  trigger_run_id: string | null
  status: AvatarStatus
  created_at: string
  updated_at: string
}
export type DefaultAvatar = {
  id: string
  name: string
  style: AvatarStyle
  image: string
  description: string
}
export const defaultAvatars: DefaultAvatar[] = [
  {
    id: "emma",
    name: "Emma",
    style: "Podcast",
    image: "/avatars/emma.png",
    description: "Warm host presence for interviews and explainers.",
  },
  {
    id: "adam",
    name: "Adam",
    style: "Casual",
    image: "/avatars/adam.png",
    description: "Approachable creator avatar for everyday videos.",
  },
  {
    id: "jack",
    name: "Jack",
    style: "3D Cartoon",
    image: "/avatars/jack.png",
    description: "Expressive presenter for short-form product stories.",
  },
  {
    id: "jen",
    name: "Jen",
    style: "Stylized",
    image: "/avatars/jen.png",
    description: "Polished brand persona with a modern editorial look.",
  },
]
export function buildAvatarObjectKey(
  userId: string,
  avatarId: string,
  filename: string
) {
  const safeFilename = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${userId}/${avatarId}/${safeFilename || "avatar.png"}`
}
