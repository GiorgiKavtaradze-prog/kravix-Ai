export type ImageGenerationModel = {
  id: string
  label: string
  provider: "replicate"
  providerModel: string
  replicateOwner: string
  replicateName: string
  replicateReferenceInput: "input_images" | "image_input"
  replicateAspectRatios: Partial<Record<ImageGenerationAspectRatio, string>>
  actualCostUsd: number
  profitMarginUsd: number
  finalUserCostUsd: number
  credits: number
}

export type ImageGenerationAspectRatio = "16:9" | "9:16" | "1:1"

export const imageGenerationModels = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    provider: "replicate",
    providerModel: "openai/gpt-image-2",
    replicateOwner: "openai",
    replicateName: "gpt-image-2",
    replicateReferenceInput: "input_images",
    replicateAspectRatios: {
      "16:9": "3:2",
      "9:16": "2:3",
      "1:1": "1:1",
    },
    actualCostUsd: 0.04,
    profitMarginUsd: 0.01,
    finalUserCostUsd: 0.05,
    credits: 50,
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    provider: "replicate",
    providerModel: "google/nano-banana-2",
    replicateOwner: "google",
    replicateName: "nano-banana-2",
    replicateReferenceInput: "image_input",
    replicateAspectRatios: {
      "16:9": "16:9",
      "9:16": "9:16",
      "1:1": "1:1",
    },
    actualCostUsd: 0.03,
    profitMarginUsd: 0.006,
    finalUserCostUsd: 0.036,
    credits: 36,
  },
  {
    id: "seedream",
    label: "Seedream",
    provider: "replicate",
    providerModel: "bytedance/seedream-4.5",
    replicateOwner: "bytedance",
    replicateName: "seedream-4.5",
    replicateReferenceInput: "image_input",
    replicateAspectRatios: {
      "16:9": "16:9",
      "9:16": "9:16",
      "1:1": "1:1",
    },
    actualCostUsd: 0.03,
    profitMarginUsd: 0.01,
    finalUserCostUsd: 0.04,
    credits: 40,
  },
  {
    id: "flux",
    label: "Flux",
    provider: "replicate",
    providerModel: "black-forest-labs/flux-2-flex",
    replicateOwner: "black-forest-labs",
    replicateName: "flux-2-flex",
    replicateReferenceInput: "input_images",
    replicateAspectRatios: {
      "16:9": "16:9",
      "9:16": "9:16",
      "1:1": "1:1",
    },
    actualCostUsd: 0.05,
    profitMarginUsd: 0.015,
    finalUserCostUsd: 0.065,
    credits: 65,
  },
] as const satisfies ImageGenerationModel[]

export type ImageGenerationModelId = (typeof imageGenerationModels)[number]["id"]

export function getImageGenerationModel(modelId: string) {
  return imageGenerationModels.find((model) => model.id === modelId) ?? null
}

export function getReplicateAspectRatio(
  model: ImageGenerationModel,
  aspectRatio: ImageGenerationAspectRatio
) {
  return model.replicateAspectRatios[aspectRatio] ?? aspectRatio
}
