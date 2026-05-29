export type VoiceType = "custom" | "default"

export type VoiceCloneStatus = "queued" | "cloning" | "completed" | "failed"

export type TtsGenerationStatus = "queued" | "generating" | "completed" | "failed"

export type VoiceRecord = {
  id: string
  user_id: string
  name: string
  voice_type: "custom"
  sample_url: string
  preview_audio_url: string | null
  avatar_image: string | null
  status: VoiceCloneStatus
  is_selected: boolean
  trigger_run_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type DefaultVoice = {
  id: string
  name: string
  provider: "deepgram"
  model: string
  description: string
  avatar: string
  accent: string
  tone: string
  previewText: string
  previewUrl: string
}

export type TtsGenerationRecord = {
  id: string
  user_id: string
  voice_id: string
  voice_type: VoiceType
  voice_name: string
  text: string
  character_count: number
  credits_charged: number
  audio_url: string | null
  audio_mime_type: string | null
  status: TtsGenerationStatus
  trigger_run_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type CreditBalance = {
  user_id: string
  balance: number
  created_at: string
  updated_at: string
}

export const TTS_MAX_CHARACTERS = 2000

export const voicePreviewText =
  "This is your cloned voice preview, ready for stories, agents, and studio projects."

export const defaultDeepgramVoices: DefaultVoice[] = [
  {
    id: "deepgram-thalia",
    name: "Thalia",
    provider: "deepgram",
    model: "aura-2-thalia-en",
    description: "Clear, confident, and energetic for product demos.",
    avatar: "/avatars/emma.png",
    accent: "American English",
    tone: "Confident",
    previewText: "A clear and upbeat voice for modern customer experiences.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-thalia.wav",
  },
  {
    id: "deepgram-andromeda",
    name: "Andromeda",
    provider: "deepgram",
    model: "aura-2-andromeda-en",
    description: "Casual and expressive for natural conversations.",
    avatar: "/avatars/jen.png",
    accent: "American English",
    tone: "Expressive",
    previewText: "A casual, expressive voice that feels comfortable and human.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-andromeda.wav",
  },
  {
    id: "deepgram-apollo",
    name: "Apollo",
    provider: "deepgram",
    model: "aura-2-apollo-en",
    description: "Comfortable masculine delivery for explainers.",
    avatar: "/avatars/adam.png",
    accent: "American English",
    tone: "Casual",
    previewText: "A confident voice for walkthroughs, guides, and narration.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-apollo.wav",
  },
  {
    id: "deepgram-arcas",
    name: "Arcas",
    provider: "deepgram",
    model: "aura-2-arcas-en",
    description: "Smooth and clear for support and voice agents.",
    avatar: "/avatars/jack.png",
    accent: "American English",
    tone: "Smooth",
    previewText: "A smooth voice built for helpful, responsive conversations.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-arcas.wav",
  },
  {
    id: "deepgram-aries",
    name: "Aries",
    provider: "deepgram",
    model: "aura-2-aries-en",
    description: "Warm and caring with an energetic edge.",
    avatar: "/avatars/adam.png",
    accent: "American English",
    tone: "Warm",
    previewText: "A warm voice for friendly messages and guided experiences.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-aries.wav",
  },
  {
    id: "deepgram-athena",
    name: "Athena",
    provider: "deepgram",
    model: "aura-2-athena-en",
    description: "Calm, smooth, and polished for storytelling.",
    avatar: "/avatars/jen.png",
    accent: "American English",
    tone: "Professional",
    previewText: "A polished voice for stories, lessons, and brand narration.",
    previewUrl: "https://static.deepgram.com/examples/Aura-2-athena.wav",
  },
]

function safeFilename(filename: string, fallback: string) {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return cleaned || fallback
}

export function buildVoiceSampleObjectKey(
  userId: string,
  voiceId: string,
  filename: string
) {
  return `${userId}/voices/${voiceId}/samples/${safeFilename(filename, "sample.wav")}`
}

export function buildVoicePreviewObjectKey(
  userId: string,
  voiceId: string,
  filename = "preview.wav"
) {
  return `${userId}/voices/${voiceId}/previews/${safeFilename(filename, "preview.wav")}`
}

export function buildTtsAudioObjectKey(
  userId: string,
  generationId: string,
  filename = "speech.wav"
) {
  return `${userId}/voices/tts/${generationId}/${safeFilename(filename, "speech.wav")}`
}

export function getDefaultVoice(voiceId: string) {
  return defaultDeepgramVoices.find((voice) => voice.id === voiceId)
}
