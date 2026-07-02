"use client"

import type { generateAvatarTask } from "@/src/trigger/generate-avatar"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react"
import Image from "next/image"
import * as React from "react"

import {
  avatarStyles,
  buildAvatarObjectKey,
  defaultAvatars,
  type AvatarRecord,
  type AvatarStyle,
  type DefaultAvatar,
} from "@/lib/avatars"
import { AVATAR_GENERATION_CREDITS, type CreditBalance } from "@/lib/credits"
import { insforge } from "@/lib/insforge/client"
import { getInsforgeAuthHeaders } from "@/lib/insforge/client-auth-headers"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

type GenerationState = {
  avatarId: string
  runId: string
  publicAccessToken: string
}

type RunMetadata = {
  stage?: string
  progress?: number
  message?: string
  error?: string
}

function getImageSource(avatar: AvatarRecord) {
  return (
    avatar.image_16_9_url ??
    avatar.image_9_16_url ??
    avatar.source_image_url ??
    "/avatars/emma.png"
  )
}

function AvatarImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  if (src.startsWith("/")) {
    return <Image src={src} alt={alt} fill sizes="320px" className={className} />
  }

  return <img src={src} alt={alt} className={cn("size-full", className)} />
}

function CustomAvatarCard({
  avatar,
  isSelected,
  onUse,
}: {
  avatar: AvatarRecord
  isSelected: boolean
  onUse: (avatarId: string) => void
}) {
  const imageSrc = getImageSource(avatar)
  const statusLabel =
    avatar.status === "completed" ? "ready" : avatar.status.replace("_", " ")

  const isCompletedAi =
    avatar.source === "ai" &&
    avatar.status === "completed" &&
    Boolean(avatar.image_16_9_url) &&
    Boolean(avatar.image_9_16_url)

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      {isCompletedAi ? (
        <div className="relative flex justify-center items-center gap-2 h-44 bg-muted/30 p-3 border-b border-border">
          <div className="relative flex-1 overflow-hidden rounded-lg bg-black/5 aspect-[16/9] shadow-sm self-center">
            <AvatarImage
              src={avatar.image_16_9_url!}
              alt={`${avatar.name} 16:9 landscape`}
              className="object-cover transition duration-300 group-hover:scale-105"
            />
            <Badge className="absolute bottom-1.5 left-1.5 text-[9px] py-0 px-1 bg-black/60 text-white border-0 hover:bg-black/60 transition">
              16:9
            </Badge>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-black/5 aspect-[9/16] h-full shadow-sm self-center">
            <AvatarImage
              src={avatar.image_9_16_url!}
              alt={`${avatar.name} 9:16 portrait`}
              className="object-cover transition duration-300 group-hover:scale-105"
            />
            <Badge className="absolute bottom-1.5 left-1.5 text-[9px] py-0 px-1 bg-black/60 text-white border-0 hover:bg-black/60 transition">
              9:16
            </Badge>
          </div>
          <div className="absolute left-3 top-3 flex gap-2">
            <Badge variant="secondary">AI</Badge>
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <AvatarImage
            src={imageSrc}
            alt={avatar.name}
            className="object-cover transition duration-300 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3 flex gap-2">
            <Badge variant="secondary">{avatar.source === "ai" ? "AI" : avatar.source}</Badge>
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
        </div>
      )}
      <div className="space-y-4 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{avatar.name}</h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {avatar.style ?? "Custom avatar"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            variant={isSelected ? "secondary" : "default"}
            onClick={() => onUse(avatar.id)}
          >
            {isSelected ? "Selected" : "Use avatar"}
          </Button>
          {isCompletedAi ? (
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="px-2"
                onClick={() => window.open(avatar.image_16_9_url!, "_blank", "noopener,noreferrer")}
                title="Preview 16:9 aspect ratio"
              >
                16:9
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="px-2"
                onClick={() => window.open(avatar.image_9_16_url!, "_blank", "noopener,noreferrer")}
                title="Preview 9:16 aspect ratio"
              >
                9:16
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(imageSrc, "_blank", "noopener,noreferrer")}
            >
              Preview
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function DefaultAvatarCard({
  avatar,
  onChoose,
  isSaving,
  onPreview,
}: {
  avatar: DefaultAvatar
  onChoose: (avatarId: string) => void
  isSaving: boolean
  onPreview: (src: string) => void
}) {
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={avatar.image}
          alt={avatar.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        <Badge className="absolute left-3 top-3" variant="secondary">
          {avatar.style}
        </Badge>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <h3 className="text-base font-semibold">{avatar.name}</h3>
          <p className="mt-1 min-h-10 text-sm leading-5 text-muted-foreground">
            {avatar.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            onClick={() => onChoose(avatar.id)}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SparklesIcon />
            )}
            Use default
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPreview(avatar.image)}
          >
            Preview
          </Button>
        </div>
      </div>
    </article>
  )
}

function PreviewCard({
  title,
  ratio,
  src,
}: {
  title: string
  ratio: "16/9" | "9/16"
  src: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div
        className="relative overflow-hidden rounded-lg bg-muted"
        style={{ aspectRatio: ratio }}
      >
        <AvatarImage src={src} alt={title} className="object-cover" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {ratio === "16/9" ? "Landscape preview" : "Portrait preview"}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AiAvatarsClient({
  initialAvatars,
}: {
  initialAvatars: AvatarRecord[]
}) {
  const [avatars, setAvatars] = React.useState(initialAvatars)
  const [credits, setCredits] = React.useState<CreditBalance | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [style, setStyle] = React.useState<AvatarStyle>("Podcast")
  const [prompt, setPrompt] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [savingDefaultId, setSavingDefaultId] = React.useState<string | null>(null)
  const [generation, setGeneration] = React.useState<GenerationState | null>(null)
  const [selectedAvatarId, setSelectedAvatarId] = React.useState<string | null>(
    null
  )
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = React.useState<
    string | null
  >(null)
  const uploadedPreviewUrlRef = React.useRef<string | null>(null)

  const { run, error: realtimeError } = useRealtimeRun<typeof generateAvatarTask>(
    generation?.runId,
    {
      accessToken: generation?.publicAccessToken,
      enabled: Boolean(generation?.runId && generation.publicAccessToken),
      onComplete: () => {
        void refreshAvatars()
        setIsGenerating(false)
      },
    }
  )
  const metadata = (run?.metadata ?? {}) as RunMetadata
  const progress =
    typeof metadata.progress === "number"
      ? metadata.progress
      : run?.isExecuting
        ? 35
        : generation
          ? 8
          : 0
  const activeGeneratedAvatar = generation
    ? avatars.find((avatar) => avatar.id === generation.avatarId)
    : null
  const generated16x9Url =
    activeGeneratedAvatar?.image_16_9_url ??
    (run?.isSuccess
      ? (run.output as { image16x9Url?: string } | undefined)?.image16x9Url
      : null)
  const generated9x16Url =
    activeGeneratedAvatar?.image_9_16_url ??
    (run?.isSuccess
      ? (run.output as { image9x16Url?: string } | undefined)?.image9x16Url
      : null)
  const hasGeneratedImages = Boolean(generated16x9Url && generated9x16Url)
  const canSubmit = Boolean(selectedFile) && !isUploading && !isGenerating
  const canGenerate =
    canSubmit && (credits?.balance ?? 0) >= AVATAR_GENERATION_CREDITS

  React.useEffect(() => {
    return () => {
      if (uploadedPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedPreviewUrlRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    void refreshAvatars().catch(() => {
      setAvatars(initialAvatars)
    })
  }, [])

  async function refreshAvatars() {
    try {
      const { data: authData, error: authError } =
        await insforge.auth.getCurrentUser()

      if (authError || !authData.user) {
        throw new Error(authError?.message ?? "Unable to verify the current user.")
      }

      const [avatarsResult, creditResponse] = await Promise.all([
        insforge.database
          .from("avatars")
          .select("*")
          .eq("user_id", authData.user.id)
          .order("created_at", { ascending: false }),
        fetch("/api/credits", { headers: await getInsforgeAuthHeaders() }),
      ])
      const creditData = (await creditResponse.json()) as {
        credits?: CreditBalance
        error?: string
      }

      if (avatarsResult.error) {
        throw new Error(avatarsResult.error.message)
      }

      if (!creditResponse.ok || !creditData.credits) {
        throw new Error(creditData.error ?? "Unable to load credits.")
      }

      setError(null)
      setAvatars((avatarsResult.data ?? []) as AvatarRecord[])
      setCredits(creditData.credits)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to refresh avatars."
      setError(message)
      setAvatars(initialAvatars)
    }
  }

  function resetCreator(keepFile = false) {
    setError(null)
    setGeneration(null)
    setIsGenerating(false)
    setIsUploading(false)
    setPrompt("")
    setStyle("Podcast")

    if (!keepFile) {
      setSelectedFile(null)
      if (uploadedPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedPreviewUrlRef.current)
        uploadedPreviewUrlRef.current = null
      }
      setUploadedPreviewUrl(null)
    }
  }

  function handleSelectedFile(file: File | null) {
    if (uploadedPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedPreviewUrlRef.current)
      uploadedPreviewUrlRef.current = null
    }

    if (file) {
      uploadedPreviewUrlRef.current = URL.createObjectURL(file)
      setUploadedPreviewUrl(uploadedPreviewUrlRef.current)
    } else {
      setUploadedPreviewUrl(null)
    }

    setSelectedFile(file)
  }

  async function submitUpload() {
    if (!selectedFile) {
      setError("Upload an avatar image first.")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const { data: authData, error: authError } =
        await insforge.auth.getCurrentUser()

      if (authError || !authData.user) {
        throw new Error(authError?.message ?? "Unable to verify the current user.")
      }

      const avatarId = crypto.randomUUID()
      const objectKey = buildAvatarObjectKey(
        authData.user.id,
        avatarId,
        selectedFile.name
      )
      const bucket = insforge.storage.from("avatars")
      const { error: uploadError } = await bucket.upload(objectKey, selectedFile)

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const imageUrl = bucket.getPublicUrl(objectKey)
      const { data: avatar, error: insertError } = await insforge.database
        .from("avatars")
        .insert({
          id: avatarId,
          user_id: authData.user.id,
          name: selectedFile.name.replace(/\.[^.]+$/, "") || "Uploaded avatar",
          source: "upload",
          style,
          prompt: prompt.trim() ? prompt.trim() : null,
          source_image_url: imageUrl,
          image_16_9_url: imageUrl,
          image_9_16_url: imageUrl,
          status: "ready",
        })
        .select("*")
        .single()

      if (insertError || !avatar) {
        throw new Error(insertError?.message ?? "Unable to upload avatar.")
      }

      setAvatars((current) => [avatar as AvatarRecord, ...current])
      setSelectedAvatarId(avatar.id)
      setDialogOpen(false)
      resetCreator()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload avatar."
      )
    } finally {
      setIsUploading(false)
    }
  }

  async function submitGeneration() {
    if (!selectedFile) {
      setError("Upload an avatar image first.")
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const { data: authData, error: authError } =
        await insforge.auth.getCurrentUser()

      if (authError || !authData.user) {
        throw new Error(authError?.message ?? "Unable to verify the current user.")
      }

      const avatarId = crypto.randomUUID()
      const objectKey = buildAvatarObjectKey(
        authData.user.id,
        avatarId,
        `source-${selectedFile.name}`
      )
      const bucket = insforge.storage.from("avatars")
      const { error: uploadError } = await bucket.upload(objectKey, selectedFile)

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const sourceImageUrl = bucket.getPublicUrl(objectKey)
      const trimmedPrompt = prompt.trim() ? prompt.trim() : null
      const { data: avatar, error: insertError } = await insforge.database
        .from("avatars")
        .insert({
          id: avatarId,
          user_id: authData.user.id,
          name: `${style} avatar`,
          source: "ai",
          style,
          prompt: trimmedPrompt,
          source_image_url: sourceImageUrl,
          status: "queued",
        })
        .select("*")
        .single()

      if (insertError || !avatar) {
        throw new Error(insertError?.message ?? "Unable to save avatar request.")
      }

      const response = await fetch("/api/avatars/generate", {
        method: "POST",
        headers: {
          ...(await getInsforgeAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          avatarId,
          userId: authData.user.id,
          sourceImageUrl,
          style,
          prompt: trimmedPrompt,
        }),
      })
      const data = (await response.json()) as {
        avatar?: AvatarRecord
        avatarId?: string
        runId?: string
        publicAccessToken?: string
        balance?: number
        error?: string
      }

      if (
        !response.ok ||
        !data.avatarId ||
        !data.runId ||
        !data.publicAccessToken
      ) {
        if (response.status === 402) {
          window.location.href = "/dashboard/profile#credits"
          return
        }
        throw new Error(data.error ?? "Unable to start avatar generation.")
      }

      setAvatars((current) => [data.avatar ?? avatar, ...current])
      if (typeof data.balance === "number") {
        setCredits((current) =>
          current ? { ...current, balance: data.balance! } : current
        )
      }
      setSelectedAvatarId(avatar.id)
      setGeneration({
        avatarId: data.avatarId,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
    } catch (generationError) {
      setIsGenerating(false)
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to start avatar generation."
      )
    }
  }

  async function chooseDefaultAvatar(avatarId: string) {
    setSavingDefaultId(avatarId)
    setError(null)

    try {
      const { data: authData, error: authError } =
        await insforge.auth.getCurrentUser()

      if (authError || !authData.user) {
        throw new Error(authError?.message ?? "Unable to verify the current user.")
      }

      const defaultAvatar = defaultAvatars.find((avatar) => avatar.id === avatarId)

      if (!defaultAvatar) {
        throw new Error("Choose a valid default avatar.")
      }

      const { data: avatar, error: insertError } = await insforge.database
        .from("avatars")
        .insert({
          id: crypto.randomUUID(),
          user_id: authData.user.id,
          name: defaultAvatar.name,
          source: "default",
          style: defaultAvatar.style,
          source_image_url: defaultAvatar.image,
          image_16_9_url: defaultAvatar.image,
          image_9_16_url: defaultAvatar.image,
          status: "ready",
        })
        .select("*")
        .single()

      if (insertError || !avatar) {
        throw new Error(insertError?.message ?? "Unable to choose default avatar.")
      }

      setAvatars((current) => [avatar as AvatarRecord, ...current])
      setSelectedAvatarId(avatar.id)
    } catch (defaultError) {
      setError(
        defaultError instanceof Error
          ? defaultError.message
          : "Unable to choose default avatar."
      )
    } finally {
      setSavingDefaultId(null)
    }
  }

  return (
    <>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-3">
              AI avatar studio
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Create and manage your avatar library.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Start with a default persona, upload your own image, or generate
              polished 16:9 and 9:16 avatar variants with AI.
            </p>
          </div>
          <Button size="lg" onClick={() => setDialogOpen(true)}>
            <PlusIcon />
            Create New Avatar
          </Button>
        </div>

        {error && !dialogOpen ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
            <span className="font-medium">{error}</span>
            {error.includes("verify") || error.includes("authorization") ? (
              <Button
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto h-8 rounded-lg shadow-sm"
                onClick={() => {
                  localStorage.clear()
                  sessionStorage.clear()
                  document.cookie.split(";").forEach((cookie) => {
                    const eqPos = cookie.indexOf("=")
                    const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim()
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
                  })
                  window.location.href = "/sign-up"
                }}
              >
                Reset Session & Register
              </Button>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                Custom avatars
              </h3>
              <p className="text-sm text-muted-foreground">
                Saved uploads and AI generations appear here.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshAvatars()}>
              <RefreshCwIcon />
              Refresh
            </Button>
          </div>

          {avatars.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {avatars.map((avatar) => (
                <CustomAvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatarId === avatar.id}
                  onUse={setSelectedAvatarId}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/70 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SparklesIcon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                No custom avatars yet
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Create your first avatar from an uploaded image, or choose one
                of the defaults below.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              Default avatars
            </h3>
            <p className="text-sm text-muted-foreground">
              Ready-made creator personas for fast projects.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {defaultAvatars.map((avatar) => (
              <DefaultAvatarCard
                key={avatar.id}
                avatar={avatar}
                onChoose={chooseDefaultAvatar}
                isSaving={savingDefaultId === avatar.id}
                onPreview={(src) =>
                  window.open(src, "_blank", "noopener,noreferrer")
                }
              />
            ))}
          </div>
        </section>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            resetCreator()
          }
        }}
      >
        <DialogContent className="max-h-[min(92svh,900px)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create New Avatar</DialogTitle>
            <DialogDescription>
              Upload a reference image, choose a style, then generate AI
              variants or save the image unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="avatar-image">Avatar image</Label>
                <label className="group relative flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background p-5 text-center transition hover:bg-muted/50">
                  {uploadedPreviewUrl ? (
                    <>
                      <img
                        src={uploadedPreviewUrl}
                        alt="Uploaded avatar preview"
                        className="absolute inset-0 size-full object-cover"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-sm font-medium text-white backdrop-blur-sm">
                        {selectedFile?.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <UploadIcon className="mb-3 size-6 text-muted-foreground" />
                      <span className="text-sm font-medium">Choose image</span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, or WebP reference image
                      </span>
                    </>
                  )}
                  <Input
                    id="avatar-image"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      handleSelectedFile(event.target.files?.[0] ?? null)
                      setGeneration(null)
                      setIsGenerating(false)
                      setError(null)
                    }}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar-style">Avatar style</Label>
                <NativeSelect
                  id="avatar-style"
                  className="w-full"
                  value={style}
                  onChange={(event) => setStyle(event.target.value as AvatarStyle)}
                >
                  {avatarStyles.map((avatarStyle) => (
                    <NativeSelectOption key={avatarStyle} value={avatarStyle}>
                      {avatarStyle}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar-prompt">Customization prompt</Label>
                <Textarea
                  id="avatar-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Optional: outfit, mood, background, lighting..."
                  className="min-h-28 resize-none"
                />
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">AI generation</p>
                  <p className="mt-1 text-sm font-semibold">
                    {AVATAR_GENERATION_CREDITS} credits
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

            {generation ? (
              <div className="space-y-4">
                {!hasGeneratedImages ? (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">Generation status</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {metadata.message ??
                            "Starting the avatar generation task."}
                        </p>
                      </div>
                      <Loader2Icon className="size-5 animate-spin text-primary" />
                    </div>
                    <Progress value={progress} className="mt-4">
                      <ProgressLabel>
                        {metadata.stage?.replaceAll("_", " ") ?? "Queued"}
                      </ProgressLabel>
                      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                        {Math.round(progress)}%
                      </span>
                    </Progress>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      {["Preparing", "Generating", "Saving"].map((step) => (
                        <div
                          key={step}
                          className="rounded-md border border-border bg-muted/40 px-2 py-2 text-center"
                        >
                          {step}
                        </div>
                      ))}
                    </div>
                    {realtimeError ? (
                      <p className="mt-3 text-sm text-destructive">
                        {realtimeError.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {hasGeneratedImages ? (
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold">Generated avatars</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Saved to InsForge storage and your avatar library.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <PreviewCard
                        title="16:9 ratio"
                        ratio="16/9"
                        src={generated16x9Url!}
                      />
                      <PreviewCard
                        title="9:16 ratio"
                        ratio="9/16"
                        src={generated9x16Url!}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row">
              {generation ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetCreator(Boolean(selectedFile))
                  }}
                  disabled={isUploading || isGenerating}
                >
                  <RefreshCwIcon />
                  Generate New One
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => void submitUpload()}
                disabled={!canSubmit}
              >
                {isUploading ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <UploadIcon />
                )}
                Upload as It Is
              </Button>
              <Button
                onClick={() => void submitGeneration()}
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                Generate with AI
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
