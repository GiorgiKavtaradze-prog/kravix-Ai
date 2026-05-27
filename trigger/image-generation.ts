import { logger, metadata, task } from "@trigger.dev/sdk"

import {
  GENERATED_IMAGES_BUCKET,
  imageGenerationStoragePath,
  updateGenerationStatus,
} from "@/lib/image-generation/database"
import {
  getImageGenerationModel,
  type ImageGenerationAspectRatio,
} from "@/lib/image-generation/models"
import { runReplicateImageGeneration } from "@/lib/image-generation/replicate"
import { createInsForgeServerClient } from "@/lib/insforge/server"

export type GenerateImagePayload = {
  generationId: string
  userId: string
  modelId: string
  providerModel: string
  prompt: string
  referenceImageUrl: string | null
  referenceImageUrls?: string[]
  imageSize: ImageGenerationAspectRatio
  creditCost: number
}

async function imageResponseToBlob(imageUrl: string) {
  const response = await fetch(imageUrl)

  if (!response.ok) {
    throw new Error(`Unable to fetch generated image: ${response.status}`)
  }

  return await response.blob()
}

export const generateImage = task({
  id: "generate-image",
  run: async (payload: GenerateImagePayload) => {
    const insforge = createInsForgeServerClient()

    try {
      const model = getImageGenerationModel(payload.modelId)

      if (!model) {
        throw new Error(`Unsupported image generation model: ${payload.modelId}`)
      }

      metadata.set("status", "processing")
      await updateGenerationStatus(payload.generationId, "processing")

      const referenceImageUrls = payload.referenceImageUrls?.length
        ? payload.referenceImageUrls
        : payload.referenceImageUrl
          ? [payload.referenceImageUrl]
          : []

      const { imageUrl, prediction } = await runReplicateImageGeneration({
        model,
        prompt: payload.prompt,
        referenceImageUrls,
        aspectRatio: payload.imageSize,
      })

      metadata.set("status", "storing")
      const imageBlob = await imageResponseToBlob(imageUrl)
      const path = imageGenerationStoragePath(
        payload.userId,
        payload.generationId
      )
      const { data: uploadData, error: uploadError } = await insforge.storage
        .from(GENERATED_IMAGES_BUCKET)
        .upload(path, imageBlob)

      if (uploadError) {
        throw new Error(uploadError.message ?? "Unable to store generated image.")
      }

      const storedUrl =
        uploadData?.url ??
        insforge.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(path)

      const completed = await updateGenerationStatus(
        payload.generationId,
        "completed",
        {
          result_image_url: storedUrl,
          metadata: {
            provider: "replicate",
            provider_model: model.providerModel,
            provider_prediction: prediction,
            storage_path: path,
            credits_charged: payload.creditCost,
            aspect_ratio: payload.imageSize,
            reference_image_urls: referenceImageUrls,
          },
          failure_message: null,
        }
      )

      metadata.set("status", "completed")
      return completed
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image generation failed."

      logger.error("Image generation failed", {
        generationId: payload.generationId,
        error: message,
      })

      await updateGenerationStatus(payload.generationId, "failed", {
        failure_message: message,
      })
      metadata.set("status", "failed")

      throw error
    }
  },
})
