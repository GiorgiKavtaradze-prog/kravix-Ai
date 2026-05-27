import { metadata, task } from "@trigger.dev/sdk"
import Replicate from "replicate"

import {
  buildTtsAudioObjectKey,
  buildVoicePreviewObjectKey,
  getDefaultVoice,
  voicePreviewText,
} from "../../lib/voices"
import { createInsForgeServerClient } from "../../lib/insforge/server"

type CloneVoicePayload = {
  voiceId: string
  userId: string
  sampleUrl: string
}

type GenerateVoiceTtsPayload = {
  generationId: string
  userId: string
  voiceId: string
  voiceType: "custom" | "default"
  text: string
  creditsCharged: number
}

type ProgressStage =
  | "queued"
  | "preparing"
  | "cloning"
  | "generating"
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

async function updateVoiceClone(
  voiceId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("voice_clones")
    .update(values)
    .eq("id", voiceId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function deleteVoiceClone(voiceId: string, userId: string) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("voice_clones")
    .delete()
    .eq("id", voiceId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function updateTtsGeneration(
  generationId: string,
  userId: string,
  values: Record<string, unknown>
) {
  const client = createInsForgeServerClient()
  const { error } = await client.database
    .from("voice_tts_generations")
    .update(values)
    .eq("id", generationId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function loadCustomVoice(voiceId: string, userId: string) {
  const client = createInsForgeServerClient()
  const { data, error } = await client.database
    .from("voice_clones")
    .select("*")
    .eq("id", voiceId)
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to load the cloned voice.")
  }

  return data as { sample_url: string; name: string }
}

async function refundCredits({
  userId,
  generationId,
  credits,
}: {
  userId: string
  generationId: string
  credits: number
}) {
  if (credits <= 0) {
    return
  }

  const client = createInsForgeServerClient()
  const { data: creditRow, error: creditError } = await client.database
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (creditError || !creditRow) {
    return
  }

  await client.database
    .from("user_credits")
    .update({ balance: Number(creditRow.balance ?? 0) + credits })
    .eq("user_id", userId)

  await client.database.from("credit_transactions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: credits,
    type: "refund",
    description: "Voice TTS generation failed",
    reference_id: generationId,
  })
}

async function outputToBlob(output: unknown, fallbackType = "audio/wav") {
  if (output instanceof Blob) {
    return output
  }

  if (
    output &&
    typeof output === "object" &&
    "arrayBuffer" in output &&
    typeof output.arrayBuffer === "function"
  ) {
    const fileOutput = output as { arrayBuffer: () => Promise<ArrayBuffer>; type?: string }
    return new Blob([await fileOutput.arrayBuffer()], {
      type: fileOutput.type ?? fallbackType,
    })
  }

  const outputUrl =
    output &&
    typeof output === "object" &&
    "url" in output &&
    typeof output.url === "function"
      ? String((output as { url: () => URL | string }).url())
      : typeof output === "string"
        ? output
        : null

  if (!outputUrl) {
    throw new Error("The TTS model did not return an audio file.")
  }

  const response = await fetch(outputUrl)

  if (!response.ok) {
    throw new Error("Unable to download generated audio.")
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? fallbackType,
  })
}

function audioExtension(contentType: string | null) {
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) {
    return "mp3"
  }

  if (contentType?.includes("ogg")) {
    return "ogg"
  }

  return "wav"
}

async function uploadAudio({
  bucketName,
  objectKey,
  audio,
}: {
  bucketName: string
  objectKey: string
  audio: Blob
}) {
  const client = createInsForgeServerClient()
  const bucket = client.storage.from(bucketName)
  const { error } = await bucket.upload(objectKey, audio)

  if (error) {
    throw new Error(error.message)
  }

  return bucket.getPublicUrl(objectKey)
}

async function generateChatterboxAudio(input: {
  prompt: string
  audio_prompt?: string
}) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Missing REPLICATE_API_TOKEN in the Trigger.dev environment.")
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const output = await replicate.run("resemble-ai/chatterbox", { input })

  return outputToBlob(output)
}

async function generateDeepgramAudio(model: string, text: string) {
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error("Missing DEEPGRAM_API_KEY in the Trigger.dev environment.")
  }

  const url = new URL("https://api.deepgram.com/v1/speak")
  url.searchParams.set("model", model)
  url.searchParams.set("encoding", "mp3")

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(details || "Deepgram did not generate audio.")
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("content-type") ?? "audio/mpeg",
  })
}

export const cloneVoiceTask = task({
  id: "clone-voice",
  maxDuration: 900,
  run: async (payload: CloneVoicePayload) => {
    try {
      await setProgress("queued", 5, "Voice cloning is queued.")
      await updateVoiceClone(payload.voiceId, payload.userId, {
        status: "cloning",
        error_message: null,
      })

      await setProgress("preparing", 20, "Preparing the voice sample.")
      await setProgress("cloning", 50, "Creating a preview with the cloned voice.")
      const preview = await generateChatterboxAudio({
        prompt: voicePreviewText,
        audio_prompt: payload.sampleUrl,
      })

      await setProgress("saving", 82, "Saving the cloned voice preview.")
      const extension = audioExtension(preview.type)
      const previewUrl = await uploadAudio({
        bucketName: "avatars",
        objectKey: buildVoicePreviewObjectKey(
          payload.userId,
          payload.voiceId,
          `preview.${extension}`
        ),
        audio: preview,
      })

      await updateVoiceClone(payload.voiceId, payload.userId, {
        preview_audio_url: previewUrl,
        status: "completed",
      })
      await setProgress("completed", 100, "Your cloned voice is ready.")

      return {
        voiceId: payload.voiceId,
        previewAudioUrl: previewUrl,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Voice cloning failed."

      metadata.set("error", message)
      await setProgress("failed", 100, message)
      await deleteVoiceClone(payload.voiceId, payload.userId)

      throw error
    }
  },
})

export const generateVoiceTtsTask = task({
  id: "generate-voice-tts",
  maxDuration: 900,
  run: async (payload: GenerateVoiceTtsPayload) => {
    try {
      await setProgress("queued", 5, "Text to speech generation is queued.")
      await updateTtsGeneration(payload.generationId, payload.userId, {
        status: "generating",
        error_message: null,
      })

      await setProgress("preparing", 18, "Loading the selected voice.")
      let audio: Blob

      if (payload.voiceType === "custom") {
        const voice = await loadCustomVoice(payload.voiceId, payload.userId)
        await setProgress("generating", 50, `Generating speech with ${voice.name}.`)
        audio = await generateChatterboxAudio({
          prompt: payload.text,
          audio_prompt: voice.sample_url,
        })
      } else {
        const voice = getDefaultVoice(payload.voiceId)

        if (!voice) {
          throw new Error("Choose a valid default voice.")
        }

        await setProgress("generating", 50, `Generating speech with ${voice.name}.`)
        audio = await generateDeepgramAudio(voice.model, payload.text)
      }

      await setProgress("saving", 82, "Saving generated speech.")
      const extension = audioExtension(audio.type)
      const audioUrl = await uploadAudio({
        bucketName: "avatars",
        objectKey: buildTtsAudioObjectKey(
          payload.userId,
          payload.generationId,
          `speech.${extension}`
        ),
        audio,
      })

      await updateTtsGeneration(payload.generationId, payload.userId, {
        audio_url: audioUrl,
        audio_mime_type: audio.type || "audio/wav",
        status: "completed",
      })
      await setProgress("completed", 100, "Your text to speech audio is ready.")

      return {
        generationId: payload.generationId,
        audioUrl,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Text to speech generation failed."

      metadata.set("error", message)
      await setProgress("failed", 100, message)
      await updateTtsGeneration(payload.generationId, payload.userId, {
        status: "failed",
        error_message: message,
      })
      await refundCredits({
        userId: payload.userId,
        generationId: payload.generationId,
        credits: payload.creditsCharged,
      })

      throw error
    }
  },
})
