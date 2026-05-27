export const generationStatuses = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const

export type GenerationStatus = (typeof generationStatuses)[number]

export type ImageGenerationRecord = {
  id: string
  user_id: string
  model_id: string
  provider_model: string
  prompt: string
  reference_image_url: string | null
  result_image_url: string | null
  status: GenerationStatus
  credits_charged: number
  trigger_run_id: string | null
  metadata: Record<string, unknown> | null
  failure_message: string | null
  created_at: string
  updated_at: string
}

export type GenerationStatusResponse = {
  generation: ImageGenerationRecord
}
