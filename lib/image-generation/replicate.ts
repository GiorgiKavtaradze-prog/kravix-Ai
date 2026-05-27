import {
  getReplicateAspectRatio,
  type ImageGenerationAspectRatio,
  type ImageGenerationModel,
} from "@/lib/image-generation/models"

type ReplicatePrediction = {
  id: string
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled"
  output?: unknown
  error?: string | null
  urls?: {
    get?: string
  }
}

type RunReplicateImageGenerationOptions = {
  model: ImageGenerationModel
  prompt: string
  referenceImageUrls: string[]
  aspectRatio: ImageGenerationAspectRatio
}

const REPLICATE_API_BASE_URL = "https://api.replicate.com/v1"

function getReplicateApiToken() {
  const token = process.env.REPLICATE_API_TOKEN

  if (!token) {
    throw new Error("Missing REPLICATE_API_TOKEN")
  }

  return token
}

function predictionEndpoint(model: ImageGenerationModel) {
  return `${REPLICATE_API_BASE_URL}/models/${model.replicateOwner}/${model.replicateName}/predictions`
}

function predictionInput({
  model,
  prompt,
  referenceImageUrls,
  aspectRatio,
}: RunReplicateImageGenerationOptions) {
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: getReplicateAspectRatio(model, aspectRatio),
    output_format: "png",
  }

  if (referenceImageUrls.length > 0) {
    input[model.replicateReferenceInput] = referenceImageUrls
  }

  if (model.providerModel === "openai/gpt-image-2") {
    input.quality = "auto"
    input.number_of_images = 1

    if (process.env.REPLICATE_OPENAI_API_KEY) {
      input.openai_api_key = process.env.REPLICATE_OPENAI_API_KEY
    }
  }

  if (model.providerModel === "google/nano-banana-2") {
    input.resolution = "1K"
  }

  if (model.providerModel === "black-forest-labs/flux-2-pro") {
    input.resolution = "1 MP"
    input.output_quality = 90
  }

  return input
}

function outputToImageUrl(output: unknown): string | null {
  if (typeof output === "string") return output

  if (Array.isArray(output)) {
    const firstString = output.find((item) => typeof item === "string")
    if (typeof firstString === "string") return firstString
  }

  if (output && typeof output === "object") {
    const value = output as {
      url?: string
      image?: string
      image_url?: string
      imageUrl?: string
      images?: unknown
    }

    return (
      value.url ??
      value.image ??
      value.image_url ??
      value.imageUrl ??
      outputToImageUrl(value.images)
    )
  }

  return null
}

async function replicateRequest<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${getReplicateApiToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Replicate request failed (${response.status}): ${errorText}`
    )
  }

  return (await response.json()) as T
}

async function waitForPrediction(prediction: ReplicatePrediction) {
  let current = prediction

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (current.status === "succeeded") return current
    if (current.status === "failed" || current.status === "canceled") {
      throw new Error(current.error ?? `Replicate prediction ${current.status}.`)
    }

    if (!current.urls?.get) {
      throw new Error("Replicate did not return a prediction status URL.")
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
    current = await replicateRequest<ReplicatePrediction>(current.urls.get, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  }

  throw new Error("Replicate prediction timed out.")
}

export async function runReplicateImageGeneration(
  options: RunReplicateImageGenerationOptions
) {
  const prediction = await replicateRequest<ReplicatePrediction>(
    predictionEndpoint(options.model),
    {
      method: "POST",
      headers: {
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: predictionInput(options),
      }),
    }
  )
  const completedPrediction = await waitForPrediction(prediction)
  const imageUrl = outputToImageUrl(completedPrediction.output)

  if (!imageUrl) {
    throw new Error("Replicate did not return an image URL.")
  }

  return {
    imageUrl,
    prediction: completedPrediction,
  }
}
