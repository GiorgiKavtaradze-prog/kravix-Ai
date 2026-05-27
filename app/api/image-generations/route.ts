import { tasks } from "@trigger.dev/sdk"
import { NextResponse } from "next/server"
import { z } from "zod"

import type { generateImage } from "@/trigger/image-generation"
import {
  REFERENCE_IMAGES_BUCKET,
  referenceImageStoragePath,
} from "@/lib/image-generation/database"
import { getImageGenerationModel } from "@/lib/image-generation/models"
import { createInsForgeServerClient } from "@/lib/insforge/server"

export const dynamic = "force-dynamic"

const createGenerationSchema = z.object({
  userId: z.string().min(1),
  modelId: z.string().min(1),
  prompt: z.string().trim().min(8).max(4000),
  imageSize: z.enum(["16:9", "9:16", "1:1"]),
})

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function uploadReferenceImage(
  userId: string,
  generationId: string,
  file: File,
  index: number
) {
  const insforge = createInsForgeServerClient()
  const path = referenceImageStoragePath(userId, generationId, file, index)
  const { data, error } = await insforge.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(path, file)

  if (error) {
    throw new Error(error.message ?? "Unable to upload reference image.")
  }

  return data?.url ?? insforge.storage.from(REFERENCE_IMAGES_BUCKET).getPublicUrl(path)
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const payload = createGenerationSchema.safeParse({
      userId: formData.get("userId"),
      modelId: formData.get("modelId"),
      prompt: formData.get("prompt"),
      imageSize: formData.get("imageSize"),
    })

    if (!payload.success) {
      return jsonError(payload.error.issues[0]?.message ?? "Invalid request.")
    }

    const model = getImageGenerationModel(payload.data.modelId)

    if (!model) {
      return jsonError("Select a supported image generation model.")
    }

    const referenceFiles = [
      ...formData.getAll("referenceImages"),
      ...formData.getAll("referenceImage"),
    ].filter((value): value is File => value instanceof File && value.size > 0)

    if (referenceFiles.length > 3) {
      return jsonError("Upload up to 3 reference images.")
    }

    if (referenceFiles.some((file) => !file.type.startsWith("image/"))) {
      return jsonError("Reference uploads must be image files.")
    }

    const insforge = createInsForgeServerClient()
    const { data: user, error: userError } = await insforge.database
      .from("users")
      .select("id, credits")
      .eq("id", payload.data.userId)
      .single()

    if (userError || !user) {
      return jsonError("User profile was not found.", 404)
    }

    const currentCredits = Number(user.credits ?? 100)

    if (currentCredits < model.credits) {
      return jsonError("You do not have enough credits for this model.", 402)
    }

    const generationId = crypto.randomUUID()
    const now = new Date().toISOString()
    const referenceImageUrls: string[] = []

    for (const [index, file] of referenceFiles.entries()) {
      referenceImageUrls.push(
        await uploadReferenceImage(payload.data.userId, generationId, file, index)
      )
    }

    const referenceImageUrl = referenceImageUrls[0] ?? null

    const { data: generation, error: generationError } = await insforge.database
      .from("image_generations")
      .insert({
        id: generationId,
        user_id: payload.data.userId,
        model_id: model.id,
        provider_model: model.providerModel,
        prompt: payload.data.prompt,
        reference_image_url: referenceImageUrl,
        status: "queued",
        credits_charged: model.credits,
        metadata: {
          pricing: model,
          provider: "replicate",
          provider_model: model.providerModel,
          aspect_ratio: payload.data.imageSize,
          reference_image_urls: referenceImageUrls,
        },
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (generationError || !generation) {
      return jsonError(
        generationError?.message ?? "Unable to create generation.",
        500
      )
    }

    const { error: creditError } = await insforge.database
      .from("users")
      .update({
        credits: currentCredits - model.credits,
        updated_at: now,
      })
      .eq("id", payload.data.userId)

    if (creditError) {
      await insforge.database
        .from("image_generations")
        .update({
          status: "failed",
          failure_message: "Unable to reserve credits.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", generationId)

      return jsonError(creditError.message ?? "Unable to reserve credits.", 500)
    }

    await insforge.database.from("credit_transactions").insert({
      user_id: payload.data.userId,
      generation_id: generationId,
      amount: -model.credits,
      type: "image_generation_debit",
      description: `${model.label} image generation`,
      created_at: now,
    })

    const handle = await tasks.trigger<typeof generateImage>(
      "generate-image",
      {
        generationId,
        userId: payload.data.userId,
        modelId: model.id,
        providerModel: model.providerModel,
        prompt: payload.data.prompt,
        referenceImageUrl,
        referenceImageUrls,
        imageSize: payload.data.imageSize,
        creditCost: model.credits,
      },
      {
        idempotencyKey: generationId,
        tags: [`user:${payload.data.userId}`, `generation:${generationId}`],
      }
    )

    const { data: updatedGeneration } = await insforge.database
      .from("image_generations")
      .update({
        trigger_run_id: handle.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId)
      .select()
      .single()

    return NextResponse.json({
      generation: updatedGeneration ?? generation,
      credits: currentCredits - model.credits,
      triggerRunId: handle.id,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start generation."

    return jsonError(message, 500)
  }
}
