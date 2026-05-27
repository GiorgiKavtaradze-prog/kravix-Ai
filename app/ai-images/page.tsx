"use client"

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DownloadIcon,
  ImageIcon,
  Loader2Icon,
  Settings2Icon,
  Share2Icon,
  SparklesIcon,
  UploadCloudIcon,
  WandSparklesIcon,
  XIcon,
  XCircleIcon,
} from "lucide-react"
import * as React from "react"

import { DashboardShell, type DashboardUser } from "@/components/dashboard-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { imageGenerationModels } from "@/lib/image-generation/models"
import type {
  GenerationStatus,
  GenerationStatusResponse,
  ImageGenerationRecord,
} from "@/lib/image-generation/types"
import { cn } from "@/lib/utils"

const statusCopy: Record<GenerationStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
}

const statusStyles: Record<GenerationStatus, string> = {
  queued:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  processing:
    "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
}

const imageSizeOptions = [
  { value: "16:9", label: "16:9", description: "Wide" },
  { value: "9:16", label: "9:16", description: "Vertical" },
  { value: "1:1", label: "1:1", description: "Square" },
] as const

type ImageSize = (typeof imageSizeOptions)[number]["value"]
type ReferenceImageItem = {
  file: File
  previewUrl: string
}

function StatusIcon({ status }: { status: GenerationStatus }) {
  if (status === "completed") return <CheckCircle2Icon className="size-3.5" />
  if (status === "failed") return <XCircleIcon className="size-3.5" />
  if (status === "processing") {
    return <Loader2Icon className="size-3.5 animate-spin" />
  }

  return <Clock3Icon className="size-3.5" />
}

function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", statusStyles[status])}>
      <StatusIcon status={status} />
      {statusCopy[status]}
    </Badge>
  )
}

function promptStatus(status: GenerationStatus | null) {
  if (status === "queued") {
    return "Your request is queued and ready for the image worker."
  }
  if (status === "processing") {
    return "The model is generating and storing your image."
  }
  if (status === "completed") return "Your image is ready."
  if (status === "failed") {
    return "Generation failed. The failure message is saved below."
  }

  return "Describe the image, choose a model, and generate when ready."
}

export default function AIImagesPage() {
  const [modelId, setModelId] = React.useState<string>(
    imageGenerationModels[0].id
  )
  const [imageSize, setImageSize] = React.useState<ImageSize>("16:9")
  const [prompt, setPrompt] = React.useState("")
  const [referenceImages, setReferenceImages] = React.useState<
    ReferenceImageItem[]
  >([])
  const referenceImagesRef = React.useRef<ReferenceImageItem[]>([])
  const [generation, setGeneration] =
    React.useState<ImageGenerationRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const selectedModel =
    imageGenerationModels.find((model) => model.id === modelId) ??
    imageGenerationModels[0]

  React.useEffect(() => {
    if (!generation || generation.status === "completed") return
    if (generation.status === "failed") return

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/image-generations/${generation.id}?userId=${encodeURIComponent(
          generation.user_id
        )}`
      )

      if (!response.ok) return

      const data = (await response.json()) as GenerationStatusResponse
      setGeneration(data.generation)
    }, 2500)

    return () => window.clearInterval(interval)
  }, [generation])

  React.useEffect(() => {
    referenceImagesRef.current = referenceImages
  }, [referenceImages])

  React.useEffect(() => {
    return () => {
      referenceImagesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl)
      )
    }
  }, [])

  function handleReferenceImages(files: FileList | null) {
    if (!files) return

    const availableSlots = Math.max(3 - referenceImages.length, 0)
    const images = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    )
    const nextImages = images.slice(0, availableSlots).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    if (images.length + referenceImages.length > 3) {
      setError("You can upload up to 3 reference images.")
    } else {
      setError(null)
    }

    setReferenceImages((currentImages) => [...currentImages, ...nextImages])
  }

  async function handleDownloadImage() {
    if (!generation?.result_image_url) return

    setError(null)
    setIsDownloading(true)

    try {
      const response = await fetch(generation.result_image_url)

      if (!response.ok) {
        throw new Error("Unable to download the generated image.")
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `kravix-image-${generation.id}.png`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the generated image."
      )
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleShareImage() {
    if (!generation?.result_image_url) return

    setError(null)

    const shareData = {
      title: "Kravix AI image",
      text: "Generated with Kravix AI Studio.",
      url: generation.result_image_url,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }

      await navigator.clipboard.writeText(generation.result_image_url)
      setError("Image link copied to clipboard.")
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return
      }

      setError(
        shareError instanceof Error
          ? shareError.message
          : "Unable to share the generated image."
      )
    }
  }

  return (
    <DashboardShell mobileSubtitle="AI Images">
      {({ user, userCredits, setUserCredits }) => {
        const canGenerate =
          prompt.trim().length >= 8 &&
          userCredits >= selectedModel.credits &&
          !isSubmitting

        async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
          event.preventDefault()
          await submitGeneration({
            user,
            userCredits,
            setUserCredits,
          })
        }

        async function submitGeneration({
          user,
          userCredits,
          setUserCredits,
        }: {
          user: DashboardUser
          userCredits: number
          setUserCredits: React.Dispatch<React.SetStateAction<number>>
        }) {
          setError(null)
          setIsSubmitting(true)

          const formData = new FormData()
          formData.append("userId", user.id)
          formData.append("modelId", selectedModel.id)
          formData.append("prompt", prompt.trim())
          formData.append("imageSize", imageSize)

          referenceImages.forEach((referenceImage) => {
            formData.append("referenceImages", referenceImage.file)
          })

          try {
            const response = await fetch("/api/image-generations", {
              method: "POST",
              body: formData,
            })
            const data = await response.json()

            if (!response.ok) {
              throw new Error(data.error ?? "Unable to start generation.")
            }

            setGeneration(data.generation)
            setUserCredits(
              Number(data.credits ?? userCredits - selectedModel.credits)
            )
          } catch (generationError) {
            setError(
              generationError instanceof Error
                ? generationError.message
                : "Unable to start generation."
            )
          } finally {
            setIsSubmitting(false)
          }
        }

        return (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/80 bg-card/88 p-4 shadow-sm backdrop-blur-xl sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <ImageIcon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight">
                      AI Image Generation
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Prompt, queue, generate, and store studio images.
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="h-8 rounded-full px-3">
                  {userCredits} credits available
                </Badge>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
              <form
                className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5"
                onSubmit={handleGenerate}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparklesIcon className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">
                      Generation controls
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cost is reserved when the job is queued.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image-model">Model</Label>
                  <NativeSelect
                    id="image-model"
                    className="w-full"
                    value={modelId}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {imageGenerationModels.map((model) => (
                      <NativeSelectOption key={model.id} value={model.id}>
                        {model.label} - {model.credits} credits
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    {selectedModel.label} will charge {selectedModel.credits} credits.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reference-image">Reference images</Label>
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/45 px-4 py-5 text-center transition hover:border-primary/40 hover:bg-primary/5">
                    <UploadCloudIcon className="mb-2 size-5 text-primary" />
                    <span className="text-sm font-medium">
                      Upload up to 3 optional images
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      PNG, JPG, or WebP reference
                    </span>
                    <Input
                      id="reference-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) =>
                        handleReferenceImages(event.target.files)
                      }
                    />
                  </label>
                  {referenceImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      {referenceImages.map((item, index) => (
                        <div
                          key={`${item.file.name}-${item.file.lastModified}-${index}`}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.previewUrl}
                            alt={`Reference image ${index + 1}`}
                            className="size-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm opacity-0 transition group-hover:opacity-100"
                            aria-label={`Remove reference image ${index + 1}`}
                            onClick={() => {
                              URL.revokeObjectURL(item.previewUrl)
                              setReferenceImages((images) =>
                                images.filter(
                                  (_, imageIndex) => imageIndex !== index
                                )
                              )
                            }}
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt</Label>
                  <Textarea
                    id="prompt"
                    className="min-h-36 resize-none rounded-xl bg-background/70"
                    placeholder="A cinematic product photo of a translucent smart speaker on a graphite desk, soft window light, premium editorial style..."
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-background/55 p-3">
                  <div className="flex items-center gap-2">
                    <Settings2Icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">Settings</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {imageSizeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 text-sm transition",
                          imageSize === option.value
                            ? "border-primary/45 bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary/30"
                        )}
                        onClick={() => setImageSize(option.value)}
                      >
                        <span className="font-semibold">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Generation not started</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                {userCredits < selectedModel.credits ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Insufficient credits</AlertTitle>
                    <AlertDescription>
                      This model needs {selectedModel.credits} credits. You have{" "}
                      {userCredits}.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="h-12 w-full rounded-xl shadow-lg shadow-primary/20"
                  disabled={!canGenerate}
                >
                  {isSubmitting ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SparklesIcon />
                  )}
                  Generate for {selectedModel.credits} credits
                </Button>
              </form>

              <section className="min-h-[620px] rounded-2xl border border-border/80 bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 p-4 sm:p-5">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Generation preview
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {promptStatus(generation?.status ?? null)}
                    </p>
                  </div>
                  {generation ? (
                    <GenerationStatusBadge status={generation.status} />
                  ) : (
                    <Badge variant="outline">Ready</Badge>
                  )}
                </div>

                <div className="p-4 sm:p-5">
                  {generation?.result_image_url ? (
                    <div className="mb-4 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={handleDownloadImage}
                        disabled={isDownloading}
                      >
                        {isDownloading ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <DownloadIcon />
                        )}
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={handleShareImage}
                      >
                        <Share2Icon />
                        Share
                      </Button>
                    </div>
                  ) : null}

                  {generation?.status === "queued" ||
                  generation?.status === "processing" ? (
                    <div className="mb-4 rounded-xl border border-border bg-background/55 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {statusCopy[generation.status]}
                        </span>
                        <span className="text-muted-foreground">
                          {generation.status === "queued" ? "25%" : "65%"}
                        </span>
                      </div>
                      <Progress
                        value={generation.status === "queued" ? 25 : 65}
                        className="[&_[data-slot=progress-track]]:h-2"
                      />
                    </div>
                  ) : null}

                  <div className="flex min-h-[500px] items-center justify-center overflow-hidden rounded-xl border border-border bg-background/45">
                    {generation?.result_image_url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={generation.result_image_url}
                          alt="Generated image result"
                          className="max-h-[720px] w-full object-contain"
                        />
                      </>
                    ) : generation?.status === "failed" ? (
                      <div className="max-w-md p-6 text-center">
                        <XCircleIcon className="mx-auto mb-4 size-10 text-destructive" />
                        <h3 className="text-lg font-semibold">
                          Generation failed
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {generation.failure_message ??
                            "The image worker could not complete this request."}
                        </p>
                      </div>
                    ) : (
                      <div className="max-w-md p-6 text-center">
                        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          {generation ? (
                            <Loader2Icon className="size-6 animate-spin" />
                          ) : (
                            <ImageIcon className="size-6" />
                          )}
                        </div>
                        <h3 className="text-lg font-semibold">
                          {generation
                            ? "Working on your image"
                            : "No image generated yet"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {generation
                            ? "This panel will update automatically as the background job moves forward."
                            : "Choose a model, add an optional reference image, and enter a detailed prompt."}
                        </p>
                      </div>
                    )}
                  </div>

                  {generation ? (
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-xl border border-border bg-background/55 p-3">
                        <p className="text-muted-foreground">Model</p>
                        <p className="mt-1 font-medium">
                          {generation.model_id}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-background/55 p-3">
                        <p className="text-muted-foreground">
                          Credits charged
                        </p>
                        <p className="mt-1 font-medium">
                          {generation.credits_charged}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-background/55 p-3">
                        <p className="text-muted-foreground">Generation ID</p>
                        <p className="mt-1 truncate font-medium">
                          {generation.id}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        )
      }}
    </DashboardShell>
  )
}
