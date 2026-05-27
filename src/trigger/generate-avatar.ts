import { GoogleGenAI } from "@google/genai"
import { metadata, task } from "@trigger.dev/sdk"

import { buildAvatarObjectKey, type AvatarStyle } from "../../lib/avatars"
import { createInsForgeServerClient } from "../../lib/insforge/server"

type GenerateAvatarPayload = {
  avatarId: string
  userId: string
  sourceImageUrl: string
  style: AvatarStyle
  prompt: string | null
}

type ProgressStage =
  | "queued"
  | "preparing"
  | "generating_16_9"
  | "generating_9_16"
  | "saving"
  | "completed"
  | "failed"

async function setProgress(stage: ProgressStage, progress: number, message: string) {
  metadata
    .set("stage", stage)
    .set("progress", progress)
    .set("message", message)

  await metadata.flush()
}

async function updateAvatar(
  avatarId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("avatars")
    .update(values)
    .eq("id", avatarId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function fetchSourceImage(url: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Unable to load the uploaded source image.")
  }

  let contentType = response.headers.get("content-type") ?? ""

  // Fallback if content-type is missing, generic, or not an image type
  if (
    !contentType ||
    contentType === "binary/octet-stream" ||
    contentType === "application/octet-stream" ||
    !contentType.startsWith("image/")
  ) {
    const urlWithoutQuery = url.split("?")[0]
    const extension = urlWithoutQuery.split(".").pop()?.toLowerCase()
    if (extension === "png") {
      contentType = "image/png"
    } else if (extension === "jpg" || extension === "jpeg") {
      contentType = "image/jpeg"
    } else if (extension === "webp") {
      contentType = "image/webp"
    } else if (extension === "gif") {
      contentType = "image/gif"
    } else {
      contentType = "image/png" // Safe fallback
    }
  }

  const data = Buffer.from(await response.arrayBuffer()).toString("base64")

  return { data, contentType }
}

function buildPrompt(style: AvatarStyle, prompt: string | null, aspectRatio: string) {
  return [
    `Create a polished AI avatar portrait in a ${aspectRatio} composition.`,
    `Avatar style: ${style}.`,
    "Use the uploaded image as the identity and visual reference.",
    "Keep the avatar clean, professional, creator-friendly, and suitable for a modern AI media dashboard.",
    "Avoid text, captions, logos, watermarks, extra people, and distorted facial features.",
    prompt ? `Customization request: ${prompt}` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

async function generateImage({
  ai,
  sourceImage,
  style,
  prompt,
  aspectRatio,
}: {
  ai: GoogleGenAI
  sourceImage: Awaited<ReturnType<typeof fetchSourceImage>>
  style: AvatarStyle
  prompt: string | null
  aspectRatio: "16:9" | "9:16"
}) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      { text: buildPrompt(style, prompt, aspectRatio) },
      {
        inlineData: {
          mimeType: sourceImage.contentType,
          data: sourceImage.data,
        },
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize: "1K",
      },
    },
  })

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (part) => "inlineData" in part && part.inlineData?.data
  )

  if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData?.data) {
    throw new Error(`Gemini did not return a ${aspectRatio} avatar image.`)
  }

  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
  }
}

async function uploadGeneratedImage({
  userId,
  avatarId,
  aspectRatio,
  image,
}: {
  userId: string
  avatarId: string
  aspectRatio: "16-9" | "9-16"
  image: { data: string; mimeType: string }
}) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from("avatars")
  const extension = image.mimeType.includes("jpeg") ? "jpg" : "png"
  const objectKey = buildAvatarObjectKey(
    userId,
    avatarId,
    `generated-${aspectRatio}.${extension}`
  )
  const file = new Blob([Buffer.from(image.data, "base64")], {
    type: image.mimeType,
  })
  const { error } = await bucket.upload(objectKey, file)

  if (error) {
    throw new Error(error.message)
  }

  return bucket.getPublicUrl(objectKey)
}

export const generateAvatarTask = task({
  id: "generate-avatar",
  maxDuration: 900,
  run: async (payload: GenerateAvatarPayload) => {
    try {
      await setProgress("queued", 5, "Avatar generation is queued.")
      await updateAvatar(payload.avatarId, payload.userId, {
        status: "generating",
      })

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY in the Trigger.dev environment.")
      }

      await setProgress("preparing", 15, "Preparing the uploaded reference image.")
      const sourceImage = await fetchSourceImage(payload.sourceImageUrl)
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

      await setProgress("generating_16_9", 35, "Generating the 16:9 avatar.")
      const landscape = await generateImage({
        ai,
        sourceImage,
        style: payload.style,
        prompt: payload.prompt,
        aspectRatio: "16:9",
      })

      await setProgress("generating_9_16", 65, "Generating the 9:16 avatar.")
      const portrait = await generateImage({
        ai,
        sourceImage,
        style: payload.style,
        prompt: payload.prompt,
        aspectRatio: "9:16",
      })

      await setProgress("saving", 85, "Saving generated avatar previews.")
      const image16x9Url = await uploadGeneratedImage({
        userId: payload.userId,
        avatarId: payload.avatarId,
        aspectRatio: "16-9",
        image: landscape,
      })
      const image9x16Url = await uploadGeneratedImage({
        userId: payload.userId,
        avatarId: payload.avatarId,
        aspectRatio: "9-16",
        image: portrait,
      })

      await updateAvatar(payload.avatarId, payload.userId, {
        image_16_9_url: image16x9Url,
        image_9_16_url: image9x16Url,
        status: "completed",
      })
      await setProgress("completed", 100, "Your AI avatar is ready.")

      return {
        avatarId: payload.avatarId,
        image16x9Url,
        image9x16Url,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Avatar generation failed."

      metadata.set("error", message)
      await setProgress("failed", 100, message)
      await updateAvatar(payload.avatarId, payload.userId, {
        status: "failed",
      })

      throw error
    }
  },
})
