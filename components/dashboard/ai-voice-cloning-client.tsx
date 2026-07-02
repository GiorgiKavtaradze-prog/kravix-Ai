"use client"

import type {
  cloneVoiceTask,
  generateVoiceTtsTask,
} from "@/src/trigger/voice-cloning"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  AudioLinesIcon,
  CheckIcon,
  CoinsIcon,
  Loader2Icon,
  Mic2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react"
import Image from "next/image"
import * as React from "react"
import { toast } from "sonner"

import {
  TTS_MAX_CHARACTERS,
  defaultDeepgramVoices,
  type CreditBalance,
  type DefaultVoice,
  type TtsGenerationRecord,
  type VoiceRecord,
  type VoiceType,
} from "@/lib/voices"
import {
  VOICE_CLONING_CREDITS,
  calculateTtsCreditsForText,
  countBillableWords,
} from "@/lib/credits"
import { insforge } from "@/lib/insforge/client"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type RunState = {
  id: string
  runId: string
  publicAccessToken: string
}

type RunMetadata = {
  stage?: string
  progress?: number
  message?: string
  error?: string
}

type VoicesResponse = {
  customVoices: VoiceRecord[]
  defaultVoices: DefaultVoice[]
  ttsGenerations: TtsGenerationRecord[]
  credits: CreditBalance
  error?: string
}

function prettyStage(stage?: string) {
  return stage?.replaceAll("_", " ") ?? "Queued"
}

function getProgress(metadata: RunMetadata, isExecuting: boolean, isActive: boolean) {
  if (typeof metadata.progress === "number") {
    return metadata.progress
  }

  if (isExecuting) {
    return 42
  }

  return isActive ? 8 : 0
}

function useAuthHeaders() {
  return React.useCallback(async () => {
    const { data, error } = await insforge.auth.getCurrentUser()

    if (error || !data.user) {
      throw new Error(error?.message ?? "Sign in again to continue.")
    }

    const accessToken = (
      insforge as unknown as {
        tokenManager?: { getAccessToken: () => string | null }
      }
    ).tokenManager?.getAccessToken()

    if (!accessToken) {
      throw new Error("Sign in again to continue.")
    }

    return {
      Authorization: `Bearer ${accessToken}`,
      "X-Insforge-User-Id": data.user.id,
      ...(data.user.email
        ? {
          "X-Insforge-User-Email": data.user.email,
        }
        : {}),
    }
  }, [])
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channelCount = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const samples = buffer.length
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = samples * blockAlign
  const wavBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wavBuffer)
  let offset = 0

  function writeString(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
    offset += value.length
  }

  writeString("RIFF")
  view.setUint32(offset, 36 + dataSize, true)
  offset += 4
  writeString("WAVE")
  writeString("fmt ")
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, channelCount, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * blockAlign, true)
  offset += 4
  view.setUint16(offset, blockAlign, true)
  offset += 2
  view.setUint16(offset, bytesPerSample * 8, true)
  offset += 2
  writeString("data")
  view.setUint32(offset, dataSize, true)
  offset += 4

  const channels = Array.from({ length: channelCount }, (_, index) =>
    buffer.getChannelData(index)
  )

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex]))
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      )
      offset += 2
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" })
}

async function convertAudioFileToWav(file: File) {
  if (file.type === "audio/wav" || file.name.toLowerCase().endsWith(".wav")) {
    return file
  }

  const AudioContextClass =
    window.AudioContext ??
    (
      window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext
      }
    ).webkitAudioContext

  if (!AudioContextClass) {
    throw new Error("This browser cannot convert audio to WAV.")
  }

  const context = new AudioContextClass()

  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    const wav = audioBufferToWav(decoded)
    const baseName = file.name.replace(/\.[^.]+$/, "") || "voice-sample"

    return new File([wav], `${baseName}.wav`, { type: "audio/wav" })
  } finally {
    await context.close().catch(() => undefined)
  }
}

function GradientAvatar({
  image,
  name,
  accent,
}: {
  image: string | null | undefined
  name: string
  accent: string
}) {
  return (
    <div
      className={cn(
        "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/25 text-white shadow-sm",
        accent
      )}
    >
      {image ? (
        <Image
          src={image}
          alt={name}
          fill
          sizes="56px"
          className="object-cover opacity-80 mix-blend-luminosity"
        />
      ) : null}
      <Mic2Icon className="relative z-10 size-6 drop-shadow-sm" />
    </div>
  )
}

function VoiceCard({
  name,
  type,
  description,
  avatar,
  previewUrl,
  selected,
  disabled,
  status,
  isPlaying,
  onPreview,
  onSelect,
  onDelete,
  accent,
}: {
  name: string
  type: "Custom" | "Default"
  description: string
  avatar?: string | null
  previewUrl?: string | null
  selected: boolean
  disabled?: boolean
  status?: string
  isPlaying: boolean
  onPreview: () => void
  onSelect: () => void
  onDelete?: () => void
  accent: string
}) {
  return (
    <article
      onClick={disabled ? undefined : onSelect}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        disabled && "opacity-80 cursor-not-allowed"
      )}
    >
      <div className={cn("h-2", accent)} />
      {selected && (
        <div className="absolute right-3 top-4 z-10 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <CheckIcon className="size-3 stroke-[3]" />
        </div>
      )}
      <div className="space-y-5 p-4">
        <div className="flex items-start gap-4">
          <GradientAvatar image={avatar} name={name} accent={accent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold pr-6">{name}</h3>
              <Badge variant={type === "Custom" ? "default" : "secondary"}>
                {type}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {status && status !== "completed" ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium capitalize">{status.replace("_", " ")}</span>
            {status === "cloning" || status === "queued" ? (
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            variant={isPlaying ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "h-9 px-4 rounded-lg flex-1 font-medium transition-all duration-200",
              isPlaying && "bg-secondary text-secondary-foreground border-secondary shadow-sm"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onPreview()
            }}
            disabled={disabled && !previewUrl}
          >
            {isPlaying ? (
              <>
                <PauseIcon className="size-4 mr-2" />
                Pause Preview
              </>
            ) : (
              <>
                <PlayIcon className="size-4 mr-2" />
                Play Preview
              </>
            )}
          </Button>

          {onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
            >
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ProgressNotice({
  title,
  metadata,
  progress,
  isFailed,
}: {
  title: string
  metadata: RunMetadata
  progress: number
  isFailed: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-4 shadow-sm",
        isFailed
          ? "border-destructive/25 bg-destructive/10"
          : "border-primary/20 bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p
            className={cn(
              "mt-1 text-sm",
              isFailed ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {metadata.error ?? metadata.message ?? "Starting background task."}
          </p>
        </div>
        {isFailed ? null : (
          <Loader2Icon className="size-5 shrink-0 animate-spin text-primary" />
        )}
      </div>
      <Progress value={progress} className="mt-4">
        <ProgressLabel className="capitalize">
          {prettyStage(metadata.stage)}
        </ProgressLabel>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {Math.round(progress)}%
        </span>
      </Progress>
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/70 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <AudioLinesIcon className="size-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function AiVoiceCloningClient() {
  const getAuthHeaders = useAuthHeaders()
  const [customVoices, setCustomVoices] = React.useState<VoiceRecord[]>([])
  const [defaultVoices, setDefaultVoices] =
    React.useState<DefaultVoice[]>(defaultDeepgramVoices)
  const [generations, setGenerations] = React.useState<TtsGenerationRecord[]>([])
  const [credits, setCredits] = React.useState<CreditBalance | null>(null)
  const [selectedVoice, setSelectedVoice] = React.useState<{
    id: string
    type: VoiceType
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [cloneDialogOpen, setCloneDialogOpen] = React.useState(false)
  const [ttsDialogOpen, setTtsDialogOpen] = React.useState(false)
  const [voiceName, setVoiceName] = React.useState("")
  const [voiceSample, setVoiceSample] = React.useState<File | null>(null)
  const [sampleDuration, setSampleDuration] = React.useState<number | null>(null)
  const [hasConsent, setHasConsent] = React.useState(false)
  const [isStartingClone, setIsStartingClone] = React.useState(false)
  const [isStartingTts, setIsStartingTts] = React.useState(false)
  const [cloneRun, setCloneRun] = React.useState<RunState | null>(null)
  const [ttsRun, setTtsRun] = React.useState<RunState | null>(null)
  const [playingVoiceId, setPlayingVoiceId] = React.useState<string | null>(null)
  const [ttsVoiceValue, setTtsVoiceValue] = React.useState("")
  const [ttsText, setTtsText] = React.useState("")
  const [generationToDelete, setGenerationToDelete] =
    React.useState<TtsGenerationRecord | null>(null)
  const [voiceToDelete, setVoiceToDelete] = React.useState<VoiceRecord | null>(
    null
  )
  const [isDeletingGeneration, setIsDeletingGeneration] = React.useState(false)
  const [isDeletingVoice, setIsDeletingVoice] = React.useState(false)
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null)

  const {
    run: cloneRealtimeRun,
    error: cloneRealtimeError,
  } = useRealtimeRun<typeof cloneVoiceTask>(cloneRun?.runId, {
    accessToken: cloneRun?.publicAccessToken,
    enabled: Boolean(cloneRun?.runId && cloneRun.publicAccessToken),
    onComplete: () => {
      void refreshVoices()
      setIsStartingClone(false)
      if (cloneRealtimeRun?.isFailed) {
        toast.error("Voice cloning failed", {
          id: cloneRun ? `clone-${cloneRun.id}` : undefined,
          description: "The failed voice clone was removed from your library.",
        })
      } else {
        toast.success("Voice clone finished", {
          id: cloneRun ? `clone-${cloneRun.id}` : undefined,
        })
      }
    },
  })
  const {
    run: ttsRealtimeRun,
    error: ttsRealtimeError,
  } = useRealtimeRun<typeof generateVoiceTtsTask>(ttsRun?.runId, {
    accessToken: ttsRun?.publicAccessToken,
    enabled: Boolean(ttsRun?.runId && ttsRun.publicAccessToken),
    onComplete: () => {
      void refreshVoices()
      setIsStartingTts(false)
      toast.success("Text to speech audio is ready", {
        id: ttsRun ? `tts-${ttsRun.id}` : undefined,
      })
    },
  })
  const cloneMetadata = (cloneRealtimeRun?.metadata ?? {}) as RunMetadata
  const ttsMetadata = (ttsRealtimeRun?.metadata ?? {}) as RunMetadata
  const cloneProgress = getProgress(
    cloneMetadata,
    Boolean(cloneRealtimeRun?.isExecuting),
    Boolean(cloneRun)
  )
  const ttsProgress = getProgress(
    ttsMetadata,
    Boolean(ttsRealtimeRun?.isExecuting),
    Boolean(ttsRun)
  )
  const allVoiceOptions = [
    ...customVoices
      .filter((voice) => voice.status === "completed")
      .map((voice) => ({
        id: voice.id,
        type: "custom" as VoiceType,
        name: voice.name,
      })),
    ...defaultVoices.map((voice) => ({
      id: voice.id,
      type: "default" as VoiceType,
      name: voice.name,
    })),
  ]
  const ttsCharacterCount = ttsText.trim().length
  const ttsWordCount = countBillableWords(ttsText)
  const ttsCredits = calculateTtsCreditsForText(ttsText)
  const canStartClone =
    Boolean(voiceName.trim()) &&
    Boolean(voiceSample) &&
    hasConsent &&
    (credits?.balance ?? 0) >= VOICE_CLONING_CREDITS &&
    !isStartingClone
  const canStartTts =
    Boolean(ttsVoiceValue) &&
    ttsCharacterCount > 0 &&
    ttsCharacterCount <= TTS_MAX_CHARACTERS &&
    (credits?.balance ?? 0) >= ttsCredits &&
    !isStartingTts

  React.useEffect(() => {
    void refreshVoices()
    return () => {
      previewAudioRef.current?.pause()
    }
  }, [])

  React.useEffect(() => {
    if (cloneRealtimeError) {
      toast.error(cloneRealtimeError.message)
    }
  }, [cloneRealtimeError])

  React.useEffect(() => {
    if (ttsRealtimeError) {
      toast.error(ttsRealtimeError.message)
    }
  }, [ttsRealtimeError])

  async function refreshVoices() {
    setIsLoading(true)

    try {
      await insforge.auth.getCurrentUser()
      const response = await fetch("/api/voices", {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as VoicesResponse

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load voices.")
      }

      setCustomVoices(data.customVoices)
      setDefaultVoices(data.defaultVoices)
      setGenerations(data.ttsGenerations)
      setCredits(data.credits)
      setError(null)

      if (!selectedVoice) {
        const firstCustom = data.customVoices.find(
          (voice) => voice.status === "completed"
        )
        const firstDefault = data.defaultVoices[0]

        if (firstCustom) {
          setSelectedVoice({ id: firstCustom.id, type: "custom" })
        } else if (firstDefault) {
          setSelectedVoice({ id: firstDefault.id, type: "default" })
        }
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load voices."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  function resetCloneDialog() {
    setVoiceName("")
    setVoiceSample(null)
    setSampleDuration(null)
    setHasConsent(false)
  }

  function togglePlayPreview(voiceId: string, url?: string | null) {
    if (!url) {
      toast.info("Preview audio is not ready yet.")
      return
    }

    if (playingVoiceId === voiceId) {
      previewAudioRef.current?.pause()
      setPlayingVoiceId(null)
      return
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }

    setPlayingVoiceId(voiceId)
    const audio = new Audio(url)
    previewAudioRef.current = audio

    audio.onended = () => {
      setPlayingVoiceId(null)
    }
    audio.onerror = () => {
      setPlayingVoiceId(null)
      toast.error("Unable to play preview audio.")
    }

    audio.play().catch((error) => {
      setPlayingVoiceId(null)
      console.error("Playback failed", error)
    })
  }

  function handleSampleChange(file: File | null) {
    setVoiceSample(file)
    setSampleDuration(null)

    if (!file) {
      return
    }

    if (!file.type.startsWith("audio/")) {
      toast.error("Choose an audio file for the voice sample.")
      return
    }

    const audio = document.createElement("audio")
    const url = URL.createObjectURL(file)
    audio.preload = "metadata"
    audio.onloadedmetadata = () => {
      setSampleDuration(audio.duration)
      URL.revokeObjectURL(url)
    }
    audio.onerror = () => URL.revokeObjectURL(url)
    audio.src = url
  }

  async function startClone() {
    if (!canStartClone || !voiceSample) {
      return
    }

    setIsStartingClone(true)
    setError(null)

    try {
      const wavSample = await convertAudioFileToWav(voiceSample)
      const formData = new FormData()
      formData.set("name", voiceName.trim())
      formData.set("sample", wavSample)
      formData.set("consent", hasConsent ? "true" : "false")

      const response = await fetch("/api/voices/clone", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      })
      const data = (await response.json()) as {
        voice?: VoiceRecord
        voiceId?: string
        runId?: string
        publicAccessToken?: string
        error?: string
      }

      if (!response.ok || !data.voiceId || !data.runId || !data.publicAccessToken) {
        if (response.status === 402) {
          window.location.href = "/dashboard/profile#credits"
          return
        }
        throw new Error(data.error ?? "Unable to start voice cloning.")
      }

      if (data.voice) {
        setCustomVoices((current) => [data.voice!, ...current])
      }
      setCloneRun({
        id: data.voiceId,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      setCloneDialogOpen(false)
      resetCloneDialog()
      toast.loading("Voice cloning started", {
        id: `clone-${data.voiceId}`,
        description: "We will update this page as the background task progresses.",
      })
    } catch (cloneError) {
      setIsStartingClone(false)
      toast.error(
        cloneError instanceof Error
          ? cloneError.message
          : "Unable to start voice cloning."
      )
    }
  }

  async function startTts() {
    if (!canStartTts) {
      return
    }

    const [voiceType, voiceId] = ttsVoiceValue.split(":") as [VoiceType, string]
    setIsStartingTts(true)
    setError(null)

    try {
      const response = await fetch("/api/voices/tts", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceId,
          voiceType,
          text: ttsText.trim(),
        }),
      })
      const data = (await response.json()) as {
        generation?: TtsGenerationRecord
        generationId?: string
        runId?: string
        publicAccessToken?: string
        balance?: number
        error?: string
      }

      if (
        !response.ok ||
        !data.generationId ||
        !data.runId ||
        !data.publicAccessToken
      ) {
        if (response.status === 402) {
          window.location.href = "/dashboard/profile#credits"
          return
        }
        throw new Error(data.error ?? "Unable to start text to speech generation.")
      }

      if (data.generation) {
        setGenerations((current) => [data.generation!, ...current])
      }
      if (typeof data.balance === "number") {
        const balance = data.balance
        setCredits((current) =>
          current ? { ...current, balance } : current
        )
      }
      setTtsRun({
        id: data.generationId,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      setTtsDialogOpen(false)
      setTtsText("")
      toast.loading("Text to speech generation started", {
        id: `tts-${data.generationId}`,
        description: "Credits were deducted and will be refunded if the task fails.",
      })
    } catch (ttsError) {
      setIsStartingTts(false)
      toast.error(
        ttsError instanceof Error
          ? ttsError.message
          : "Unable to start text to speech generation."
      )
    }
  }

  async function deleteGeneration() {
    if (!generationToDelete) {
      return
    }

    setIsDeletingGeneration(true)

    try {
      const response = await fetch("/api/voices/tts", {
        method: "DELETE",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ generationId: generationToDelete.id }),
      })
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to delete generated audio.")
      }

      setGenerations((current) =>
        current.filter((generation) => generation.id !== generationToDelete.id)
      )
      setGenerationToDelete(null)
      toast.success("Generated audio deleted")
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete generated audio."
      )
    } finally {
      setIsDeletingGeneration(false)
    }
  }

  async function deleteVoiceClone() {
    if (!voiceToDelete) {
      return
    }

    setIsDeletingVoice(true)

    try {
      const response = await fetch("/api/voices/clone", {
        method: "DELETE",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ voiceId: voiceToDelete.id }),
      })
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to delete voice clone.")
      }

      setCustomVoices((current) =>
        current.filter((voice) => voice.id !== voiceToDelete.id)
      )
      if (
        selectedVoice?.type === "custom" &&
        selectedVoice.id === voiceToDelete.id
      ) {
        setSelectedVoice(
          defaultVoices[0] ? { id: defaultVoices[0].id, type: "default" } : null
        )
      }
      setVoiceToDelete(null)
      toast.success("Voice clone deleted")
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete voice clone."
      )
    } finally {
      setIsDeletingVoice(false)
    }
  }

  const sampleHint =
    sampleDuration == null
      ? "Upload a clear sample around 10 seconds long."
      : sampleDuration >= 7 && sampleDuration <= 20
        ? `${Math.round(sampleDuration)} seconds detected.`
        : `${Math.round(sampleDuration)} seconds detected; 10 seconds is recommended.`

  return (
    <>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-3">
              AI voice studio
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Clone voices and generate studio-ready speech.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Manage custom voice clones, use default voices, and generate
              text to speech with background processing.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
              <CoinsIcon className="size-4 text-primary" />
              <span className="text-muted-foreground">Credits</span>
              <span className="font-semibold tabular-nums">
                {credits?.balance ?? "----"}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshVoices()}>
              <RefreshCwIcon />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {error}
          </div>
        ) : null}

        {cloneRun && cloneRealtimeRun?.isSuccess !== true ? (
          <ProgressNotice
            title="Voice clone in progress"
            metadata={cloneMetadata}
            progress={cloneProgress}
            isFailed={cloneRealtimeRun?.isFailed ?? false}
          />
        ) : null}

        {ttsRun && ttsRealtimeRun?.isSuccess !== true ? (
          <ProgressNotice
            title="Text to speech generation in progress"
            metadata={ttsMetadata}
            progress={ttsProgress}
            isFailed={ttsRealtimeRun?.isFailed ?? false}
          />
        ) : null}

        <Tabs defaultValue="voices" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-2">
            <TabsTrigger value="voices">AI Voice Cloning</TabsTrigger>
            <TabsTrigger value="tts">Voice Cloning TTS</TabsTrigger>
          </TabsList>

          <TabsContent value="voices" className="mt-6 space-y-8">
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Custom voices
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Your cloned voices appear here after background processing.
                  </p>
                </div>
                <Button onClick={() => setCloneDialogOpen(true)}>
                  <PlusIcon />
                  Add New Voice Clone
                </Button>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-48 animate-pulse rounded-xl border border-border bg-muted/40"
                    />
                  ))}
                </div>
              ) : customVoices.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {customVoices.map((voice, index) => (
                    <VoiceCard
                      key={voice.id}
                      name={voice.name}
                      type="Custom"
                      description={
                        voice.status === "completed"
                          ? "Cloned with Replicate Chatterbox from your uploaded sample."
                          : voice.error_message ?? "Background cloning is running."
                      }
                      avatar={voice.avatar_image}
                      previewUrl={voice.preview_audio_url}
                      status={voice.status}
                      isPlaying={playingVoiceId === voice.id}
                      disabled={voice.status !== "completed"}
                      selected={
                        selectedVoice?.id === voice.id &&
                        selectedVoice.type === "custom"
                      }
                      onPreview={() => togglePlayPreview(voice.id, voice.preview_audio_url)}
                      onSelect={() =>
                        setSelectedVoice({ id: voice.id, type: "custom" })
                      }
                      onDelete={() => setVoiceToDelete(voice)}
                      accent={
                        [
                          "bg-gradient-to-br from-fuchsia-500 to-cyan-500",
                          "bg-gradient-to-br from-emerald-500 to-sky-500",
                          "bg-gradient-to-br from-rose-500 to-amber-400",
                        ][index % 3]
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No cloned voices yet"
                  description="Upload a short voice sample to create your first custom voice clone."
                  action={
                    <Button onClick={() => setCloneDialogOpen(true)}>
                      <PlusIcon />
                      Add New Voice Clone
                    </Button>
                  }
                />
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">
                  Default voices
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ready-made voices for fast text to speech generation.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {defaultVoices.map((voice, index) => (
                  <VoiceCard
                    key={voice.id}
                    name={voice.name}
                    type="Default"
                    description={`${voice.description} ${voice.accent}.`}
                    avatar={voice.avatar}
                    selected={
                      selectedVoice?.id === voice.id &&
                      selectedVoice.type === "default"
                    }
                    isPlaying={playingVoiceId === voice.id}
                    onPreview={() => togglePlayPreview(voice.id, voice.previewUrl)}
                    onSelect={() =>
                      setSelectedVoice({ id: voice.id, type: "default" })
                    }
                    accent={
                      [
                        "bg-gradient-to-br from-violet-500 to-teal-400",
                        "bg-gradient-to-br from-blue-500 to-lime-400",
                        "bg-gradient-to-br from-pink-500 to-orange-400",
                      ][index % 3]
                    }
                  />
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="tts" className="mt-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">
                  Generated speech
                </h3>
                <p className="text-sm text-muted-foreground">
                  TTS generations cost 10 credits per 500 words.
                </p>
              </div>
              <Button
                onClick={() => {
                  const preferred =
                    selectedVoice ??
                    (allVoiceOptions[0]
                      ? {
                        id: allVoiceOptions[0].id,
                        type: allVoiceOptions[0].type,
                      }
                      : null)
                  setTtsVoiceValue(
                    preferred ? `${preferred.type}:${preferred.id}` : ""
                  )
                  setTtsDialogOpen(true)
                }}
              >
                <WandSparklesIcon />
                Generate Text to Speech
              </Button>
            </div>

            {generations.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {generations.map((generation) => (
                  <article
                    key={generation.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-semibold">
                            {generation.voice_name}
                          </h4>
                          <Badge variant="secondary" className="capitalize">
                            {generation.voice_type}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {generation.status}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {generation.text}
                        </p>
                      </div>
                      {generation.status === "generating" ||
                        generation.status === "queued" ? (
                        <Loader2Icon className="size-5 animate-spin text-primary" />
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-muted-foreground">
                        {generation.character_count} characters ·{" "}
                        {generation.credits_charged} credits
                      </div>
                      {generation.audio_url ? (
                        <audio
                          controls
                          src={generation.audio_url}
                          className="h-10 w-full sm:w-64"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {generation.error_message ?? "Audio is processing."}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGenerationToDelete(generation)}
                      >
                        <Trash2Icon />
                        Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No generated speech yet"
                description="Generate audio from text with a cloned voice or one of the default voices."
                action={
                  <Button onClick={() => setTtsDialogOpen(true)}>
                    <WandSparklesIcon />
                    Generate Text to Speech
                  </Button>
                }
              />
            )}
          </TabsContent>
        </Tabs>
      </section>

      <Dialog
        open={cloneDialogOpen}
        onOpenChange={(open) => {
          setCloneDialogOpen(open)
          if (!open) {
            resetCloneDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add New Voice Clone</DialogTitle>
            <DialogDescription>
              Upload a short voice sample and start the Replicate cloning task.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="voice-name">Voice name</Label>
              <Input
                id="voice-name"
                value={voiceName}
                onChange={(event) => setVoiceName(event.target.value)}
                placeholder="Podcast Rahul"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice-sample">10-second voice sample</Label>
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-5 text-center transition hover:bg-muted/50">
                <UploadIcon className="mb-3 size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {voiceSample?.name ?? "Choose audio file"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {sampleHint}
                </span>
                <Input
                  id="voice-sample"
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(event) =>
                    handleSampleChange(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <Checkbox
                checked={hasConsent}
                onCheckedChange={(checked) => setHasConsent(checked === true)}
              />
              <span className="leading-6 text-muted-foreground">
                I have permission to upload and clone this voice sample.
              </span>
            </label>

            <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">This request</p>
                <p className="mt-1 text-sm font-semibold">
                  {VOICE_CLONING_CREDITS} credits
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="mt-1 text-sm font-semibold">
                  {credits?.balance ?? 0} credits
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void startClone()} disabled={!canStartClone}>
              {isStartingClone ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SparklesIcon />
              )}
              Start Voice Cloning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ttsDialogOpen} onOpenChange={setTtsDialogOpen}>
        <DialogContent className="max-h-[min(92svh,760px)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Text to Speech</DialogTitle>
            <DialogDescription>
              Select a voice, enter text, and run generation in the background.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tts-voice">Voice</Label>
              <NativeSelect
                id="tts-voice"
                className="w-full"
                value={ttsVoiceValue}
                onChange={(event) => setTtsVoiceValue(event.target.value)}
              >
                <NativeSelectOption value="">Select a voice</NativeSelectOption>
                {customVoices
                  .filter((voice) => voice.status === "completed")
                  .map((voice) => (
                    <NativeSelectOption
                      key={voice.id}
                      value={`custom:${voice.id}`}
                    >
                      {voice.name} - Custom
                    </NativeSelectOption>
                  ))}
                {defaultVoices.map((voice) => (
                  <NativeSelectOption key={voice.id} value={`default:${voice.id}`}>
                    {voice.name} - Default
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="tts-text">Text</Label>
                <span
                  className={cn(
                    "text-xs tabular-nums text-muted-foreground",
                    ttsCharacterCount > TTS_MAX_CHARACTERS && "text-destructive"
                  )}
                >
                  {ttsCharacterCount}/{TTS_MAX_CHARACTERS}
                </span>
              </div>
              <Textarea
                id="tts-text"
                value={ttsText}
                maxLength={TTS_MAX_CHARACTERS}
                onChange={(event) => setTtsText(event.target.value)}
                placeholder="Write the script you want this voice to speak..."
                className="min-h-40 resize-none"
              />
            </div>

            <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Pricing</p>
                <p className="mt-1 text-sm font-semibold">
                  10 credits per 500 words
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This request</p>
                <p className="mt-1 text-sm font-semibold">
                  {ttsCredits} credits for {ttsWordCount} words
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="mt-1 text-sm font-semibold">
                  {credits?.balance ?? 0} credits
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTtsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void startTts()} disabled={!canStartTts}>
              {isStartingTts ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <WandSparklesIcon />
              )}
              Generate Text to Speech
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(generationToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingGeneration) {
            setGenerationToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete generated audio?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the generated text to speech record from your
              library. Credits are not refunded for deleted completed results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingGeneration}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deleteGeneration()}
              disabled={isDeletingGeneration}
            >
              {isDeletingGeneration ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(voiceToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingVoice) {
            setVoiceToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete voice clone?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the custom cloned voice from your voice library.
              Existing generated audio records will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingVoice}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void deleteVoiceClone()}
              disabled={isDeletingVoice}
            >
              {isDeletingVoice ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
