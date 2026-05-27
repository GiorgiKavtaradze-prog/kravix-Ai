import type { ImageGenerationRecord, GenerationStatus } from "@/lib/image-generation/types"
import { createInsForgeServerClient } from "@/lib/insforge/server"

export const GENERATED_IMAGES_BUCKET = "generated-images"
export const REFERENCE_IMAGES_BUCKET = "image-references"

export function imageGenerationStoragePath(userId: string, generationId: string) {
  return `${userId}/${generationId}.png`
}

export function referenceImageStoragePath(
  userId: string,
  generationId: string,
  file: File,
  index = 0
) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "png"
  return `${userId}/${generationId}/reference-${index + 1}.${extension}`
}

export async function getUserCredits(userId: string) {
  const insforge = createInsForgeServerClient()
  const { data, error } = await insforge.database
    .from("users")
    .select("id, credits")
    .eq("id", userId)
    .single()

  if (error) {
    throw new Error(error.message ?? "Unable to load user credits.")
  }

  return Number(data?.credits ?? 100)
}

export async function updateGenerationStatus(
  generationId: string,
  status: GenerationStatus,
  values: Partial<ImageGenerationRecord> = {}
) {
  const insforge = createInsForgeServerClient()
  const { data, error } = await insforge.database
    .from("image_generations")
    .update({
      ...values,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", generationId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message ?? "Unable to update generation status.")
  }

  return data as ImageGenerationRecord
}
