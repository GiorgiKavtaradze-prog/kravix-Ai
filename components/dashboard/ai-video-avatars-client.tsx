"use client"

import type { generateAvatarVideoTask } from "@/src/trigger/generate-avatar-video"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  CheckIcon,
  ClapperboardIcon,
  CoinsIcon,
  DownloadIcon,
  EyeIcon,
  FileVideoIcon,
  FilmIcon,
  Loader2Icon,
  Mic2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import {
  AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS,
  avatarVideoCreditCosts,
  avatarVideoDurations,
  avatarVideoRatios,
  avatarVideoTones,
  calculateAvatarVideoCredits,
  formatAvatarVideoDuration,
  formatAvatarVideoRatio,
  getAvatarImageForRatio,
  type AvatarVideoDuration,
  type AvatarVideoRatio,
  type AvatarVideoRecord,
  type ScriptTone,
} from "@/lib/avatar-videos"
import type { AvatarRecord } from "@/lib/avatars"
import { insforge } from "@/lib/insforge/client"
import { cn } from "@/lib/utils"
import type {
  CreditBalance,
  DefaultVoice,
  VoiceRecord,
  VoiceType,
} from "@/lib/voices"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
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

type RealtimeAvatarRun = {
  metadata?: unknown
  isExecuting?: boolean
  isSuccess?: boolean
  isFailed?: boolean
  output?: unknown
} | undefined

type AvatarVideosResponse = {
  videos: AvatarVideoRecord[]
  avatars: AvatarRecord[]
  customVoices: VoiceRecord[]
  defaultVoices: DefaultVoice[]
  credits: CreditBalance
  error?: string
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

function mediaSource(src: string | null | undefined) {
  return src && src.trim() ? src : "/avatars/emma.png"
}

function MediaImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSource(src)} alt={alt} className={cn("size-full object-cover", className)} />
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function statusVariant(status: AvatarVideoRecord["status"]) {
  if (status === "completed") {
    return "default"
  }

  if (status === "failed") {
    return "destructive"
  }

  return "secondary"
}

function prettyStage(stage?: string) {
  return stage?.replaceAll("_", " ") ?? "Queued"
}

function progressFromRun(metadata: RunMetadata, isExecuting: boolean, active: boolean) {
  if (typeof metadata.progress === "number") {
    return metadata.progress
  }

  if (isExecuting) {
    return 42
  }

  return active ? 8 : 0
}

function getAvatarPreview(avatar: AvatarRecord | null, ratio: AvatarVideoRatio) {
  return avatar ? getAvatarImageForRatio(avatar, ratio) : null
}

function GradientVoiceIcon({ index }: { index: number }) {
  const accents = [
    "from-sky-500 via-cyan-400 to-emerald-400",
    "from-fuchsia-500 via-rose-400 to-amber-300",
    "from-indigo-500 via-blue-400 to-teal-300",
    "from-slate-800 via-violet-500 to-sky-400",
  ]

  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
        accents[index % accents.length]
      )}
    >
      <Mic2Icon className="size-5" />
    </span>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <Skeleton className="aspect-video rounded-md" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function VideoDetailsDialog({
  video,
  onOpenChange,
}: {
  video: AvatarVideoRecord | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(video)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{video?.title ?? "Avatar video"}</DialogTitle>
          <DialogDescription>
            Generation metadata and saved script for this avatar video.
          </DialogDescription>
        </DialogHeader>

        {video ? (
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div
              className={cn(
                "overflow-hidden rounded-lg border border-border bg-black",
                video.screen_ratio === "9:16" ? "mx-auto aspect-[9/16] max-h-[560px]" : "aspect-video"
              )}
            >
              {video.video_url ? (
                <video src={video.video_url} controls className="size-full object-contain" />
              ) : (
                <MediaImage src={video.thumbnail_url} alt={video.title} />
              )}
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p><span className="text-muted-foreground">Avatar:</span> {video.avatar_name}</p>
              <p><span className="text-muted-foreground">Voice:</span> {video.voice_name}</p>
              <p><span className="text-muted-foreground">Duration:</span> {formatAvatarVideoDuration(video.duration_seconds)}</p>
              <p><span className="text-muted-foreground">Ratio:</span> {formatAvatarVideoRatio(video.screen_ratio)}</p>
              <p><span className="text-muted-foreground">Credits:</span> {video.credits_charged}</p>
              <p><span className="text-muted-foreground">Created:</span> {prettyDate(video.created_at)}</p>
              {video.error_message ? (
                <p className="text-destructive">{video.error_message}</p>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <Label>Script</Label>
              <div className="mt-2 rounded-lg border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                {video.script}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function VideoCard({
  video,
  onPreview,
  onDetails,
  onRetry,
  isRetrying,
}: {
  video: AvatarVideoRecord
  onPreview: (video: AvatarVideoRecord) => void
  onDetails: (video: AvatarVideoRecord) => void
  onRetry: (video: AvatarVideoRecord) => void
  isRetrying: boolean
}) {
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("relative overflow-hidden bg-muted", video.screen_ratio === "9:16" ? "aspect-[9/12]" : "aspect-video")}>
        <MediaImage src={video.thumbnail_url ?? video.avatar_image_url} alt={video.title} className="transition duration-300 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge variant={statusVariant(video.status)} className="capitalize">
            {video.status}
          </Badge>
          <Badge variant="outline" className="bg-background/80 backdrop-blur">
            {video.screen_ratio}
          </Badge>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{video.title}</h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {video.avatar_name} with {video.voice_name}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">{formatAvatarVideoDuration(video.duration_seconds)}</span>
          <span className="rounded-md bg-muted px-2 py-1">{video.credits_charged} credits</span>
          <span className="rounded-md bg-muted px-2 py-1">{prettyDate(video.created_at)}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(video)}
            disabled={!video.video_url}
          >
            <EyeIcon />
            Preview
          </Button>
          {video.video_url ? (
            <a
              href={video.video_url}
              download
              className={buttonVariants({ variant: "outline", size: "sm", className: "px-2" })}
              aria-label={`Download ${video.title}`}
            >
              <DownloadIcon className="size-4" />
            </a>
          ) : null}
          {video.status === "failed" ? (
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              onClick={() => onRetry(video)}
              disabled={isRetrying}
              aria-label={`Retry ${video.title}`}
            >
              {isRetrying ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="px-2"
            onClick={() => onDetails(video)}
            aria-label={`Open ${video.title} details`}
          >
            <FileVideoIcon />
          </Button>
        </div>
      </div>
    </article>
  )
}

export function AiVideoAvatarsClient() {
  const getAuthHeaders = useAuthHeaders()
  const [videos, setVideos] = React.useState<AvatarVideoRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = React.useState<AvatarVideoRecord | null>(null)
  const [detailsVideo, setDetailsVideo] = React.useState<AvatarVideoRecord | null>(null)
  const [retryingId, setRetryingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    void refreshVideos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshVideos() {
    setIsLoading(true)

    try {
      const response = await fetch("/api/avatar-videos", {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as AvatarVideosResponse

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load avatar videos.")
      }

      setVideos(data.videos)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load avatar videos.")
    } finally {
      setIsLoading(false)
    }
  }

  async function retryVideo(video: AvatarVideoRecord) {
    setRetryingId(video.id)

    try {
      const response = await fetch(`/api/avatar-videos/${video.id}/retry`, {
        method: "POST",
        headers: await getAuthHeaders(),
      })
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to retry avatar video.")
      }

      toast.success("Avatar video retry started")
      await refreshVideos()
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : "Unable to retry avatar video.")
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-3">AI video avatars</Badge>
          <h2 className="text-3xl font-semibold tracking-tight">Avatar video library</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Browse every generated talking avatar video with saved scripts, voice metadata, and permanent downloads.
          </p>
        </div>
        <Button size="lg" render={<Link href="/dashboard/ai-video-avatar/create" />}>
          <PlusIcon />
          Generate New Avatar Video
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="destructive" size="sm" onClick={() => void refreshVideos()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Generated videos</h3>
          <p className="text-sm text-muted-foreground">Completed, failed, and in-progress generations appear here.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshVideos()}>
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingGrid />
      ) : videos.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPreview={setPreviewVideo}
              onDetails={setDetailsVideo}
              onRetry={retryVideo}
              isRetrying={retryingId === video.id}
            />
          ))}
        </div>
      ) : (
        <Empty className="min-h-[360px] border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
              <ClapperboardIcon />
            </EmptyMedia>
            <EmptyTitle>No avatar videos yet</EmptyTitle>
            <EmptyDescription>
              Create your first talking avatar video with a saved avatar, voice, script, screen size, and duration.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/dashboard/ai-video-avatar/create" />}>
              <SparklesIcon />
              Create first avatar video
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <Dialog open={Boolean(previewVideo)} onOpenChange={(open) => !open && setPreviewVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewVideo?.title ?? "Video preview"}</DialogTitle>
            <DialogDescription>Preview the saved avatar video.</DialogDescription>
          </DialogHeader>
          {previewVideo?.video_url ? (
            <div className={cn("mx-auto overflow-hidden rounded-lg bg-black", previewVideo.screen_ratio === "9:16" ? "aspect-[9/16] max-h-[70vh]" : "aspect-video w-full")}>
              <video src={previewVideo.video_url} controls autoPlay className="size-full object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <VideoDetailsDialog video={detailsVideo} onOpenChange={(open) => !open && setDetailsVideo(null)} />
    </section>
  )
}

function AvatarSelectCard({
  avatar,
  selected,
  ratio,
  onSelect,
}: {
  avatar: AvatarRecord
  selected: boolean
  ratio: AvatarVideoRatio
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-primary ring-3 ring-primary/20" : "border-border"
      )}
    >
      <div className={cn("relative overflow-hidden bg-muted", ratio === "9:16" ? "aspect-[9/12]" : "aspect-video")}>
        <MediaImage src={getAvatarPreview(avatar, ratio)} alt={avatar.name} />
        {selected ? (
          <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{avatar.name}</span>
          {avatar.style ? <Badge variant="secondary">{avatar.style}</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground capitalize">{avatar.source} avatar</p>
      </div>
    </button>
  )
}

function VoiceSelectCard({
  name,
  type,
  description,
  selected,
  isPlaying,
  index,
  onSelect,
  onPreview,
}: {
  name: string
  type: VoiceType
  description: string
  selected: boolean
  isPlaying: boolean
  index: number
  onSelect: () => void
  onPreview: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-primary ring-3 ring-primary/20" : "border-border"
      )}
    >
      <GradientVoiceIcon index={index} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          <Badge variant="secondary" className="capitalize">{type}</Badge>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        role="button"
        tabIndex={0}
        className={buttonVariants({ variant: "outline", size: "icon-sm", className: "shrink-0" })}
        onClick={(event) => {
          event.stopPropagation()
          onPreview()
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            event.stopPropagation()
            onPreview()
          }
        }}
        aria-label={`Preview ${name}`}
      >
        {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </span>
      {selected ? <CheckIcon className="size-4 text-primary" /> : null}
    </button>
  )
}

function PreviewPanel({
  avatar,
  voiceName,
  script,
  ratio,
  duration,
  run,
  runState,
  completedVideo,
  onReset,
}: {
  avatar: AvatarRecord | null
  voiceName: string
  script: string
  ratio: AvatarVideoRatio
  duration: AvatarVideoDuration
  run: RealtimeAvatarRun
  runState: RunState | null
  completedVideo: AvatarVideoRecord | null
  onReset: () => void
}) {
  const metadata = (run?.metadata ?? {}) as RunMetadata
  const progress = progressFromRun(metadata, Boolean(run?.isExecuting), Boolean(runState))
  const image = getAvatarPreview(avatar, ratio)
  const isCompleted = Boolean(completedVideo?.video_url) || Boolean(run?.isSuccess)
  const output = run?.isSuccess ? (run.output as { videoUrl?: string } | undefined) : undefined
  const videoUrl = completedVideo?.video_url ?? output?.videoUrl

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Live preview</h3>
            <p className="text-sm text-muted-foreground">{formatAvatarVideoRatio(ratio)} · {formatAvatarVideoDuration(duration)}</p>
          </div>
          <Badge variant="secondary">{calculateAvatarVideoCredits(duration)} credits</Badge>
        </div>
        <div className={cn("mx-auto overflow-hidden rounded-lg border border-border bg-muted", ratio === "9:16" ? "aspect-[9/16] max-h-[560px]" : "aspect-video")}>
          {videoUrl ? (
            <video src={videoUrl} controls className="size-full bg-black object-contain" />
          ) : image ? (
            <div className="relative size-full">
              <MediaImage src={image} alt={avatar?.name ?? "Selected avatar"} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                <p className="truncate text-sm font-semibold">{avatar?.name}</p>
                <p className="truncate text-xs opacity-80">{voiceName || "Select a voice"}</p>
              </div>
            </div>
          ) : (
            <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Select an avatar to preview the video frame.
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
            {script.trim() || "Your script preview will appear here as you write or generate it."}
          </p>
        </div>
      </div>

      {runState ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Progress</h3>
              <p className="text-sm text-muted-foreground">
                {metadata.message ?? "Starting background generation."}
              </p>
            </div>
            {run?.isExecuting ? <Loader2Icon className="size-5 animate-spin text-primary" /> : null}
          </div>
          <Progress value={progress} className="mt-4">
            <ProgressLabel className="capitalize">{prettyStage(metadata.stage)}</ProgressLabel>
          </Progress>
          {metadata.error ? <p className="mt-3 text-sm text-destructive">{metadata.error}</p> : null}
          {isCompleted && videoUrl ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button variant="outline" size="sm" render={<Link href="/dashboard/ai-video-avatar" />}>
                View library
              </Button>
              <a href={videoUrl} download className={buttonVariants({ variant: "outline", size: "sm" })}>
                <DownloadIcon className="size-4" />
                Download
              </a>
              <Button size="sm" onClick={onReset}>
                Generate another
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

export function CreateAiVideoAvatarClient() {
  const getAuthHeaders = useAuthHeaders()
  const [videos, setVideos] = React.useState<AvatarVideoRecord[]>([])
  const [avatars, setAvatars] = React.useState<AvatarRecord[]>([])
  const [customVoices, setCustomVoices] = React.useState<VoiceRecord[]>([])
  const [defaultVoices, setDefaultVoices] = React.useState<DefaultVoice[]>([])
  const [credits, setCredits] = React.useState<CreditBalance | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isGeneratingScript, setIsGeneratingScript] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [scriptMode, setScriptMode] = React.useState<"manual" | "ai">("manual")
  const [title, setTitle] = React.useState("")
  const [script, setScript] = React.useState("")
  const [topic, setTopic] = React.useState("")
  const [tone, setTone] = React.useState<ScriptTone>("professional")
  const [selectedAvatarId, setSelectedAvatarId] = React.useState("")
  const [selectedVoice, setSelectedVoice] = React.useState<{ id: string; type: VoiceType } | null>(null)
  const [ratio, setRatio] = React.useState<AvatarVideoRatio>("16:9")
  const [duration, setDuration] = React.useState<AvatarVideoDuration>(5)
  const [activeRun, setActiveRun] = React.useState<RunState | null>(null)
  const [completedVideo, setCompletedVideo] = React.useState<AvatarVideoRecord | null>(null)
  const [playingVoiceId, setPlayingVoiceId] = React.useState<string | null>(null)
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null)

  const { run, error: realtimeError } = useRealtimeRun<typeof generateAvatarVideoTask>(activeRun?.runId, {
    accessToken: activeRun?.publicAccessToken,
    enabled: Boolean(activeRun?.runId && activeRun.publicAccessToken),
    onComplete: () => {
      setIsSubmitting(false)
      if (run?.isFailed) {
        toast.error("Avatar video generation failed")
      } else {
        toast.success("Avatar video is ready")
      }
    },
  })

  const selectedAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null
  const allVoices = [
    ...customVoices
      .filter((voice) => voice.status === "completed")
      .map((voice) => ({
        id: voice.id,
        type: "custom" as VoiceType,
        name: voice.name,
        description: "Cloned voice",
        previewUrl: voice.preview_audio_url,
      })),
    ...defaultVoices.map((voice) => ({
      id: voice.id,
      type: "default" as VoiceType,
      name: voice.name,
      description: `${voice.tone} · ${voice.accent}`,
      previewUrl: voice.previewUrl,
    })),
  ]
  const selectedVoiceDetails = selectedVoice
    ? allVoices.find((voice) => voice.id === selectedVoice.id && voice.type === selectedVoice.type)
    : null
  const scriptCount = script.trim().length
  const creditCost = calculateAvatarVideoCredits(duration)
  const canSubmit =
    Boolean(selectedAvatar) &&
    Boolean(selectedVoice) &&
    scriptCount > 0 &&
    scriptCount <= AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS &&
    (credits?.balance ?? 0) >= creditCost &&
    !isSubmitting

  React.useEffect(() => {
    void refreshData()
    return () => {
      previewAudioRef.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (realtimeError) {
      toast.error(realtimeError.message)
    }
  }, [realtimeError])

  async function refreshData() {
    setIsLoading(true)

    try {
      const response = await fetch("/api/avatar-videos", {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as AvatarVideosResponse

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load avatar video data.")
      }

      setVideos(data.videos)
      setAvatars(data.avatars)
      setCustomVoices(data.customVoices)
      setDefaultVoices(data.defaultVoices)
      setCredits(data.credits)

      if (!selectedAvatarId && data.avatars[0]) {
        setSelectedAvatarId(data.avatars[0].id)
      }

      if (!selectedVoice) {
        const firstCustom = data.customVoices.find((voice) => voice.status === "completed")
        const firstDefault = data.defaultVoices[0]

        if (firstCustom) {
          setSelectedVoice({ id: firstCustom.id, type: "custom" })
        } else if (firstDefault) {
          setSelectedVoice({ id: firstDefault.id, type: "default" })
        }
      }

      return data
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "Unable to load avatar video data.")
      return null
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    if (!activeRun || (!run?.isSuccess && !run?.isFailed)) {
      return
    }

    void refreshData().then((data) => {
      const video = data?.videos.find((item) => item.id === activeRun.id) ?? null
      setCompletedVideo(video)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, run?.isFailed, run?.isSuccess])

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

    previewAudioRef.current?.pause()
    const audio = new Audio(url)
    previewAudioRef.current = audio
    setPlayingVoiceId(voiceId)
    audio.onended = () => setPlayingVoiceId(null)
    audio.onerror = () => {
      setPlayingVoiceId(null)
      toast.error("Unable to play preview audio.")
    }
    audio.play().catch(() => {
      setPlayingVoiceId(null)
      toast.error("Unable to play preview audio.")
    })
  }

  async function generateScript() {
    if (!topic.trim()) {
      toast.error("Enter a topic for the AI script.")
      return
    }

    setIsGeneratingScript(true)

    try {
      const response = await fetch("/api/avatar-videos/script", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: topic.trim(), tone }),
      })
      const data = (await response.json()) as { script?: string; error?: string }

      if (!response.ok || !data.script) {
        throw new Error(data.error ?? "Unable to generate script.")
      }

      setScript(data.script)
      toast.success("Script generated")
    } catch (scriptError) {
      toast.error(scriptError instanceof Error ? scriptError.message : "Unable to generate script.")
    } finally {
      setIsGeneratingScript(false)
    }
  }

  async function submitVideo() {
    if (!canSubmit || !selectedVoice) {
      if (!selectedAvatar) {
        toast.error("Choose an avatar.")
      } else if (!selectedVoice) {
        toast.error("Choose a voice.")
      } else if (!script.trim()) {
        toast.error("Enter a script.")
      } else if ((credits?.balance ?? 0) < creditCost) {
        toast.error("Not enough credits for this avatar video.")
      }
      return
    }

    setIsSubmitting(true)
    setCompletedVideo(null)

    try {
      const response = await fetch("/api/avatar-videos", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim() || `${selectedAvatar?.name ?? "Avatar"} video`,
          script,
          scriptMode,
          scriptTopic: scriptMode === "ai" ? topic.trim() : null,
          scriptTone: scriptMode === "ai" ? tone : null,
          avatarId: selectedAvatarId,
          voiceId: selectedVoice.id,
          voiceType: selectedVoice.type,
          durationSeconds: duration,
          screenRatio: ratio,
        }),
      })
      const data = (await response.json()) as {
        video?: AvatarVideoRecord
        videoId?: string
        runId?: string
        publicAccessToken?: string
        balance?: number
        error?: string
      }

      if (!response.ok || !data.videoId || !data.runId || !data.publicAccessToken) {
        throw new Error(data.error ?? "Unable to start avatar video generation.")
      }

      if (data.video) {
        setVideos((current) => [data.video!, ...current])
      }

      if (typeof data.balance === "number") {
        const balance = data.balance
        setCredits((current) => (current ? { ...current, balance } : current))
      }

      setActiveRun({
        id: data.videoId,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      toast.loading("Avatar video generation started", {
        id: `avatar-video-${data.videoId}`,
        description: "Credits were deducted and will be refunded if the task fails.",
      })
    } catch (submitError) {
      setIsSubmitting(false)
      toast.error(submitError instanceof Error ? submitError.message : "Unable to start avatar video generation.")
    }
  }

  function resetForm() {
    setActiveRun(null)
    setCompletedVideo(null)
    setTitle("")
    setScript("")
    setTopic("")
    setScriptMode("manual")
  }

  if (isLoading && !avatars.length && !defaultVoices.length) {
    return (
      <section className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-[720px] rounded-lg" />
        <Skeleton className="h-[620px] rounded-lg" />
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <Badge variant="secondary" className="mb-3">Create avatar video</Badge>
          <h2 className="text-3xl font-semibold tracking-tight">Generate a talking AI avatar</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose an avatar, voice, script, screen size, and duration. Generation runs in the background.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="video-title">Title</Label>
            <Input
              id="video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Product launch explainer"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Script</h3>
              <p className="text-sm text-muted-foreground">Write your own or generate a draft with AI.</p>
            </div>
            <Badge variant={scriptCount > AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS ? "destructive" : "outline"}>
              {scriptCount}/{AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS}
            </Badge>
          </div>
          <Tabs value={scriptMode} onValueChange={(value) => setScriptMode(value as "manual" | "ai")}>
            <TabsList>
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="ai">AI generated</TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="mt-4" />
            <TabsContent value="ai" className="mt-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="script-topic">Topic</Label>
                  <Input
                    id="script-topic"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="How our AI studio speeds up campaigns"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
                    {avatarVideoTones.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={tone === option ? "default" : "outline"}
                        className="capitalize"
                        onClick={() => setTone(option)}
                        disabled={isSubmitting}
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void generateScript()}
                  disabled={isGeneratingScript || isSubmitting}
                >
                  {isGeneratingScript ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                  Generate
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          <div className="mt-4 space-y-2">
            <Label htmlFor="avatar-script">Editable script</Label>
            <Textarea
              id="avatar-script"
              value={script}
              onChange={(event) => setScript(event.target.value)}
              rows={8}
              placeholder="Write the words your avatar should speak..."
              disabled={isSubmitting}
              aria-invalid={scriptCount > AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS}
            />
            {scriptCount > AVATAR_VIDEO_MAX_SCRIPT_CHARACTERS ? (
              <p className="text-sm text-destructive">Shorten the script before generating.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Screen size</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {avatarVideoRatios.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={ratio === option ? "default" : "outline"}
                    onClick={() => setRatio(option)}
                    disabled={isSubmitting}
                  >
                    <FilmIcon />
                    {option === "16:9" ? "Landscape" : "Vertical"}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Duration</h3>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {avatarVideoDurations.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={duration === option ? "default" : "outline"}
                    className="px-1"
                    onClick={() => setDuration(option)}
                    disabled={isSubmitting}
                  >
                    {option}s
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Estimated cost: <span className="font-semibold text-foreground">{avatarVideoCreditCosts[duration]} credits</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold tracking-tight">Avatar</h3>
            <p className="text-sm text-muted-foreground">Select from your existing avatar library.</p>
          </div>
          {avatars.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {avatars.map((avatar) => (
                <AvatarSelectCard
                  key={avatar.id}
                  avatar={avatar}
                  ratio={ratio}
                  selected={selectedAvatarId === avatar.id}
                  onSelect={() => setSelectedAvatarId(avatar.id)}
                />
              ))}
            </div>
          ) : (
            <Empty className="border border-dashed border-border bg-muted/30 p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon"><SparklesIcon /></EmptyMedia>
                <EmptyTitle>No avatars available</EmptyTitle>
                <EmptyDescription>Create or upload an avatar before generating a video.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" render={<Link href="/dashboard/avatar" />}>Open avatars</Button>
              </EmptyContent>
            </Empty>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold tracking-tight">Voice</h3>
            <p className="text-sm text-muted-foreground">Choose a cloned voice or one of the default voices.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {allVoices.map((voice, index) => (
              <VoiceSelectCard
                key={`${voice.type}:${voice.id}`}
                name={voice.name}
                type={voice.type}
                description={voice.description}
                index={index}
                selected={selectedVoice?.id === voice.id && selectedVoice.type === voice.type}
                isPlaying={playingVoiceId === `${voice.type}:${voice.id}`}
                onSelect={() => setSelectedVoice({ id: voice.id, type: voice.type })}
                onPreview={() => togglePlayPreview(`${voice.type}:${voice.id}`, voice.previewUrl)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">Ready to generate?</p>
              <p className="text-muted-foreground">The task continues in Trigger.dev after you leave this page.</p>
            </div>
            <Button size="lg" onClick={() => void submitVideo()} disabled={!canSubmit}>
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Generate Avatar Video
            </Button>
          </div>
        </div>
      </div>

      <PreviewPanel
        avatar={selectedAvatar}
        voiceName={selectedVoiceDetails?.name ?? ""}
        script={script}
        ratio={ratio}
        duration={duration}
        run={run}
        runState={activeRun}
        completedVideo={completedVideo ?? videos.find((video) => video.id === activeRun?.id) ?? null}
        onReset={resetForm}
      />
    </section>
  )
}
