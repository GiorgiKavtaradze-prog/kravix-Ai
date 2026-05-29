"use client"

import type { generateAiVideoAgentTask } from "@/src/trigger/generate-ai-video-agent"
import type { editAiVideoSceneAssetTask } from "@/src/trigger/edit-ai-video-agent"
import type { renderAiVideoAgentTask } from "@/src/trigger/render-ai-video-agent"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  CheckIcon,
  ClapperboardIcon,
  DownloadIcon,
  Edit3Icon,
  EyeIcon,
  FilmIcon,
  ImageIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  Mic2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, Audio, Video, spring, interpolate } from "remotion"
import { Player } from "@remotion/player"
import * as React from "react"
import { toast } from "sonner"

import {
  AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS,
  aiVideoAgentBrollStyles,
  aiVideoAgentCaptionStyles,
  aiVideoAgentDurations,
  aiVideoAgentSceneCounts,
  aiVideoAgentScreenSizes,
  calculateAiVideoAgentCredits,
  formatAiVideoBrollStyle,
  formatAiVideoCaptionStyle,
  formatAiVideoDuration,
  formatAiVideoScreenSize,
  getAvatarImageForAiVideo,
  type AiVideoAgentBrollStyle,
  type AiVideoAgentCaptionStyle,
  type AiVideoAgentDuration,
  type AiVideoAgentScreenSize,
  type AiVideoAssetRecord,
  type AiVideoProjectRecord,
  type AiVideoSceneRecord,
  type CaptionCue,
  type CaptionWordTiming,
} from "@/lib/ai-video-agent"
import { getActiveSceneVisualAsset } from "@/lib/ai-video-agent-composition"
import type { AvatarRecord } from "@/lib/avatars"
import { insforge } from "@/lib/insforge/client"
import { cn } from "@/lib/utils"
import type { CreditBalance, DefaultVoice, VoiceRecord, VoiceType } from "@/lib/voices"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type AiVideoAgentResponse = {
  projects: AiVideoProjectRecord[]
  avatars: AvatarRecord[]
  customVoices: VoiceRecord[]
  defaultVoices: DefaultVoice[]
  credits: CreditBalance
  error?: string
}

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

type RealtimeAiVideoRun = {
  metadata?: unknown
  isExecuting?: boolean
  isSuccess?: boolean
  isFailed?: boolean
  output?: unknown
} | undefined

type RemotionPreviewProps = {
  project: Pick<
    AiVideoProjectRecord,
    | "title"
    | "duration_seconds"
    | "screen_size"
    | "avatar_name"
    | "avatar_image_url"
    | "voice_name"
    | "caption_style"
    | "broll_style"
    | "captions"
    | "voiceover_url"
  >
  scenes: AiVideoSceneRecord[]
  assets: AiVideoAssetRecord[]
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
      ...(data.user.email ? { "X-Insforge-User-Email": data.user.email } : {}),
    }
  }, [])
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function prettyStage(stage?: string) {
  return stage?.replaceAll("_", " ") ?? "Queued"
}

function statusVariant(status: AiVideoProjectRecord["status"]) {
  if (status === "completed") return "default"
  if (status === "failed") return "destructive"
  return "secondary"
}

function progressFromRun(metadata: RunMetadata, isExecuting: boolean, active: boolean) {
  if (typeof metadata.progress === "number") return metadata.progress
  if (isExecuting) return 48
  return active ? 8 : 0
}

function mediaSource(src: string | null | undefined) {
  return src && src.trim() ? src : "/avatars/emma.png"
}

function MediaImage({
  src,
  alt,
  className,
  objectFit = "object-cover",
}: {
  src: string | null | undefined
  alt: string
  className?: string
  objectFit?: "object-cover" | "object-contain"
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaSource(src)} alt={alt} className={cn("size-full", objectFit, className)} />
}

function getSceneAsset(assets: AiVideoAssetRecord[], sceneId: string | null | undefined) {
  return getActiveSceneVisualAsset(assets, sceneId)
}

function captionClass(style: AiVideoAgentCaptionStyle) {
  const styles: Record<AiVideoAgentCaptionStyle, string> = {
    bold_subtitle: "bg-black/85 px-8 py-5 font-black uppercase text-white rounded-3xl border-2 border-white/10 tracking-wide",
    minimal_clean: "bg-white/95 px-8 py-5 font-semibold text-slate-950 rounded-3xl shadow-2xl border border-slate-200",
    podcast: "bg-slate-950/95 px-8 py-5 font-black text-cyan-100 rounded-3xl border-2 border-cyan-500/30 tracking-tight shadow-[0_0_20px_rgba(45,212,191,0.25)]",
    tiktok_viral: "bg-yellow-300 px-8 py-5 font-black uppercase text-black rounded-3xl border-4 border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]",
    gradient_highlight: "bg-slate-950/90 px-8 py-5 font-black rounded-3xl border border-white/20 shadow-2xl",
    word_by_word: "bg-black/90 px-8 py-5 font-black text-white rounded-3xl border border-white/5",
  }

  return styles[style]
}

function RemotionCaptionRenderer({
  caption,
  currentTime,
  style,
}: {
  caption: CaptionCue | null
  currentTime: number
  style: AiVideoAgentCaptionStyle
}) {
  if (!caption) return null

  // Ensure we have a words array
  let words: CaptionWordTiming[] | undefined = caption.words
  if (!words || words.length === 0) {
    // Synthesize words from text
    const textWords = caption.text ? caption.text.trim().split(/\s+/) : []
    const duration = (caption.end ?? 10) - (caption.start ?? 0)
    const wordDuration = duration / Math.max(1, textWords.length)
    words = textWords.map((word: string, i: number) => ({
      word,
      start: (caption.start ?? 0) + i * wordDuration,
      end: (caption.start ?? 0) + (i + 1) * wordDuration,
    }))
  }

  if (words.length === 0) {
    return <span className="text-5xl md:text-6xl lg:text-7xl font-bold">{caption.text}</span>
  }

  // Find the active word index
  let activeIndex = words.findIndex((w) => currentTime >= w.start && currentTime <= w.end)
  if (activeIndex === -1) {
    // If none is active, find the closest one
    const nextIndex = words.findIndex((w) => w.start > currentTime)
    if (nextIndex === -1) {
      activeIndex = words.length - 1
    } else {
      activeIndex = Math.max(0, nextIndex - 1)
    }
  }

  // Chunk into 3-word groups
  const chunkIndex = Math.floor(activeIndex / 3)
  const startIdx = chunkIndex * 3
  const visibleWords = words.slice(startIdx, startIdx + 3)

  return (
    <span className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      {visibleWords.map((wordObj, i: number) => {
        const isActive = currentTime >= wordObj.start && currentTime <= wordObj.end

        let activeWordClass = ""
        switch (style) {
          case "bold_subtitle":
            activeWordClass = isActive
              ? "text-yellow-400 scale-120 inline-block font-black drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
              : "text-white opacity-85"
            break
          case "minimal_clean":
            activeWordClass = isActive
              ? "text-primary font-black underline decoration-4 decoration-primary scale-115 inline-block"
              : "text-slate-700 opacity-90 font-medium"
            break
          case "podcast":
            activeWordClass = isActive
              ? "text-teal-400 drop-shadow-[0_0_15px_rgba(45,212,191,1)] scale-120 inline-block font-black"
              : "text-cyan-100/50 font-semibold"
            break
          case "tiktok_viral":
            activeWordClass = isActive
              ? "text-rose-600 scale-130 font-black inline-block uppercase rotate-3 drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
              : "text-black opacity-80"
            break
          case "gradient_highlight":
            activeWordClass = isActive
              ? "bg-gradient-to-r from-cyan-400 to-orange-400 bg-clip-text text-transparent font-black scale-120 inline-block drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              : "text-slate-400/80 font-bold"
            break
          case "word_by_word":
            activeWordClass = isActive
              ? "text-green-400 underline decoration-green-400 decoration-wavy scale-120 inline-block font-black"
              : "text-white/40"
            break
          default:
            activeWordClass = isActive
              ? "text-primary font-bold scale-120 inline-block"
              : "text-white opacity-80"
        }

        const wordText = ["bold_subtitle", "tiktok_viral"].includes(style)
          ? wordObj.word.toUpperCase()
          : wordObj.word

        return (
          <span
            key={i}
            className={cn("transition-all duration-100 text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight px-1", activeWordClass)}
            style={{
              lineHeight: 1.25,
            }}
          >
            {wordText}
          </span>
        )
      })}
    </span>
  )
}

function IllustrationScene({
  title,
  summary,
  accentColor = "#14b8a6",
  sceneIndex,
}: {
  title: string
  summary: string
  accentColor?: string
  sceneIndex: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90 } })
  const drift = interpolate(frame % 180, [0, 90, 180], [-24, 24, -24])

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #08111f, #10252f 48%, #211724)",
        overflow: "hidden",
        color: "white",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 24% 28%, ${accentColor}55, transparent 32%), radial-gradient(circle at 78% 72%, rgba(249,115,22,0.25), transparent 34%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          top: "16%",
          width: "30%",
          aspectRatio: "1",
          borderRadius: 999,
          background: accentColor,
          opacity: 0.28,
          transform: `translateX(${drift}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "11%",
          top: "18%",
          width: "34%",
          aspectRatio: "1.35",
          borderRadius: 34,
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(255,255,255,0.1)",
          transform: `translateY(${-drift}px) rotate(${drift / 10}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "9%",
          right: "9%",
          bottom: "12%",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [42, 0])}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            borderRadius: 999,
            padding: "10px 16px",
            background: accentColor,
            color: "#06111f",
            fontWeight: 900,
          }}
        >
          Scene {sceneIndex + 1}
        </div>
        <h1
          style={{
            margin: "22px 0 12px",
            maxWidth: 1050,
            fontSize: 76,
            lineHeight: 0.94,
            fontWeight: 950,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 940,
            fontSize: 31,
            lineHeight: 1.22,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          {summary}
        </p>
      </div>
    </AbsoluteFill>
  )
}

function AiVideoRemotionPreview({ project, scenes, assets }: RemotionPreviewProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const seconds = frame / fps
  const activeScene =
    scenes.find(
      (scene) => seconds >= Number(scene.start_time) && seconds < Number(scene.end_time)
    ) ?? scenes[0]
  const activeAsset = getSceneAsset(assets, activeScene?.id)
  const activeCaption =
    project.captions?.find((caption) => seconds >= caption.start && seconds < caption.end) ??
    (activeScene
      ? {
        text: activeScene.caption_text,
        start: Number(activeScene.start_time),
        end: Number(activeScene.end_time),
        style: project.caption_style,
      }
      : {
        text: "Create amazing videos",
        start: 0,
        end: 10,
        style: project.caption_style,
      })
  const isIntro = seconds < 5
  const showAvatar = seconds >= 5 && assets.some((asset) => {
    if (asset.asset_type !== "avatar_clip") return false
    const timing = asset.metadata as { start?: number; end?: number } | null
    return seconds >= Number(timing?.start ?? -1) && seconds < Number(timing?.end ?? -1)
  })
  const activeAvatarAsset = assets.find((asset) => {
    if (asset.asset_type !== "avatar_clip") return false
    const timing = asset.metadata as { start?: number; end?: number } | null
    return seconds >= Number(timing?.start ?? -1) && seconds < Number(timing?.end ?? -1)
  })

  return (
    <AbsoluteFill className="overflow-hidden bg-slate-950 text-white">
      {/* Hidden preloader to cache all assets and eliminate blank screen flashes during transitions */}
      <div style={{ display: "none" }} aria-hidden="true">
        {assets.map((asset) => {
          if (!asset.url) return null
          if (asset.mime_type?.startsWith("video/")) {
            return (
              <video
                key={`preload-${asset.id}`}
                src={asset.url}
                preload="auto"
                muted
              />
            )
          }
          return (
            <img
              key={`preload-${asset.id}`}
              src={asset.url}
              alt=""
            />
          )
        })}
        {project.avatar_image_url && (
          <img src={project.avatar_image_url} alt="" />
        )}
      </div>

      {project.voiceover_url ? (
        <Audio src={project.voiceover_url} />
      ) : null}

      {/* Intro section: Full-screen Avatar */}
      {isIntro ? (
        <AbsoluteFill className="overflow-hidden bg-slate-950 z-0">
          {activeAvatarAsset?.url && activeAvatarAsset.mime_type?.startsWith("video/") ? (
            <div className="relative size-full overflow-hidden bg-slate-950">
              <Video
                src={activeAvatarAsset.url}
                className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
                muted
                loop
                preload="auto"
              />
              <Video
                src={activeAvatarAsset.url}
                className="relative z-10 size-full object-contain"
                muted
                loop
                preload="auto"
              />
            </div>
          ) : (
            <div className="relative size-full overflow-hidden bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaSource(activeAvatarAsset?.url ?? project.avatar_image_url)}
                alt=""
                className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
              />
              <MediaImage
                src={activeAvatarAsset?.url ?? project.avatar_image_url}
                alt={project.avatar_name}
                objectFit="object-contain"
                className="relative z-10 size-full"
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/30" />
        </AbsoluteFill>
      ) : null}

      {/* Main scenes b-roll section (shows past 5 seconds) */}
      {!isIntro && scenes.map((scene) => {
        const sceneStart = Number(scene.start_time)
        const sceneEnd = Number(scene.end_time)
        if (sceneEnd <= 5) return null // Completely covered by the 5s intro

        const adjustedStart = Math.max(5, sceneStart)
        const startFrame = Math.floor(adjustedStart * fps)
        const durationFrames = Math.max(1, Math.ceil((sceneEnd - adjustedStart) * fps))
        const asset = getSceneAsset(assets, scene.id)

        return (
          <Sequence
            key={scene.id}
            from={startFrame}
            durationInFrames={durationFrames}
          >
            <AbsoluteFill className="z-0">
              {asset?.asset_type === "remotion_component" ? (
                <IllustrationScene
                  title={scene.title}
                  summary={asset.metadata?.prompt as string || scene.summary}
                  accentColor={(scene.remotion_data as { accentColor?: string } | null)?.accentColor}
                  sceneIndex={scene.scene_index}
                />
              ) : asset?.url && asset.mime_type?.startsWith("video/") ? (
                <div className="relative size-full overflow-hidden bg-slate-950">
                  <Video
                    src={asset.url}
                    className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
                    muted
                    loop
                    preload="auto"
                  />
                  <Video
                    src={asset.url}
                    className="relative z-10 size-full object-contain"
                    muted
                    loop
                    preload="auto"
                  />
                </div>
              ) : (
                <div className="relative size-full overflow-hidden bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaSource(asset?.url ?? project.avatar_image_url)}
                    alt=""
                    className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
                  />
                  <MediaImage
                    src={asset?.url ?? project.avatar_image_url}
                    alt={scene.title}
                    objectFit="object-contain"
                    className="relative z-10 size-full"
                  />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/30" />
            </AbsoluteFill>
          </Sequence>
        )
      })}

      {/* PIP Avatar (rendered after intro duration) */}
      {showAvatar ? (
        <div
          className={cn(
            "absolute overflow-hidden border-2 border-white/70 bg-black shadow-2xl z-20",
            project.screen_size === "9:16"
              ? "bottom-[14%] right-[6%] h-[28%] w-[34%] rounded-xl"
              : "bottom-[10%] right-[5%] h-[36%] w-[24%] rounded-xl"
          )}
        >
          {activeAvatarAsset?.url && activeAvatarAsset.mime_type?.startsWith("video/") ? (
            <div className="relative size-full overflow-hidden bg-slate-950">
              <Video
                src={activeAvatarAsset.url}
                className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
                muted
                loop
                preload="auto"
              />
              <Video
                src={activeAvatarAsset.url}
                className="relative z-10 size-full object-contain"
                muted
                loop
                preload="auto"
              />
            </div>
          ) : (
            <div className="relative size-full overflow-hidden bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaSource(activeAvatarAsset?.url ?? project.avatar_image_url)}
                alt=""
                className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
              />
              <MediaImage
                src={activeAvatarAsset?.url ?? project.avatar_image_url}
                alt={project.avatar_name}
                objectFit="object-contain"
                className="relative z-10 size-full"
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="absolute left-[6%] top-[6%] max-w-[70%] z-30">
        <div className="rounded-md bg-black/45 px-3 py-1 text-sm font-semibold">
          {activeScene?.title ?? project.title}
        </div>
      </div>

      {activeCaption ? (
        <div className="absolute inset-x-[6%] bottom-[7%] flex justify-center text-center z-40">
          <div className={cn("max-w-[88%] rounded-md leading-tight shadow-2xl", captionClass(project.caption_style))}>
            <RemotionCaptionRenderer
              caption={activeCaption}
              currentTime={seconds}
              style={project.caption_style}
            />
          </div>
        </div>
      ) : null}

      {!activeAsset && !activeScene ? (
        <AbsoluteFill className="items-center justify-center p-8 text-center text-sm text-white/70">
          Configure the form to preview your video layout.
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  )
}

function RemotionPlayerPreview({
  project,
  scenes,
  assets,
}: RemotionPreviewProps) {
  const width = project.screen_size === "16:9" ? 1920 : 1080
  const height = project.screen_size === "16:9" ? 1080 : 1920

  // Calculate actual duration in seconds from the end time of the last scene or the duration_seconds
  const actualDuration = scenes.length > 0
    ? Math.max(...scenes.map((s) => Number(s.end_time)))
    : project.duration_seconds

  return (
    <Player
      component={AiVideoRemotionPreview}
      inputProps={{ project, scenes, assets }}
      durationInFrames={Math.max(1, Math.ceil(actualDuration * 30))}
      fps={30}
      compositionWidth={width}
      compositionHeight={height}
      controls
      autoPlay={false}
      loop
      className="size-full"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <Skeleton className="aspect-video rounded-md" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProjectCard({
  project,
  onPreview,
  onRender,
  isRendering,
}: {
  project: AiVideoProjectRecord
  onPreview: (project: AiVideoProjectRecord) => void
  onRender: (project: AiVideoProjectRecord) => void
  isRendering: boolean
}) {
  const processing = project.status !== "completed" && project.status !== "failed"

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        onClick={() => {
          if (project.status === "completed") {
            onPreview(project)
          }
        }}
        className={cn(
          "relative overflow-hidden bg-muted",
          project.status === "completed" && "cursor-pointer",
          project.screen_size === "9:16" ? "mx-auto aspect-[9/16] max-h-[360px] w-full" : "aspect-video"
        )}
      >
        <MediaImage src={project.avatar_image_url} alt={project.title} className="transition duration-300 group-hover:scale-105" />

        {/* Modern Play Overlay on Hover */}
        {!processing && project.status === "completed" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/95 text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-110 active:scale-95">
              <PlayIcon className="ml-1 size-7 fill-current" />
            </span>
          </div>
        )}

        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
          <Badge variant={statusVariant(project.status)} className="capitalize">
            {project.status}
          </Badge>
          <Badge variant="outline" className="bg-background/85 backdrop-blur">
            {project.screen_size}
          </Badge>
        </div>
        {processing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 p-4 text-center text-white">
            <Loader2Icon className="mb-2 size-8 animate-spin text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {prettyStage(project.progress_stage ?? project.status)}
            </span>
            <Progress value={project.progress} className="mt-3 w-3/4" />
          </div>
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{project.title}</h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {project.avatar_name} · {project.voice_name}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">{formatAiVideoDuration(project.duration_seconds)}</span>
          <span className="rounded-md bg-muted px-2 py-1">{formatAiVideoScreenSize(project.screen_size)}</span>
          <span className="rounded-md bg-muted px-2 py-1">{formatAiVideoBrollStyle(project.broll_style)}</span>
          <span className="rounded-md bg-muted px-2 py-1">{prettyDate(project.created_at)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border bg-background px-2 py-1.5">
            <span className="text-muted-foreground">Avatar</span>
            <span className="block truncate font-medium">{project.avatar_name}</span>
          </div>
          <div className="rounded-md border border-border bg-background px-2 py-1.5">
            <span className="text-muted-foreground">Voice</span>
            <span className="block truncate font-medium">{project.voice_name}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(project)}
            disabled={project.status !== "completed"}
          >
            <EyeIcon />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={project.status !== "completed"}
            render={<Link href={`/dashboard/ai-video-agent/${project.id}/edit`} />}
          >
            <Edit3Icon />
            Edit Video
          </Button>
          {project.final_video_url ? (
            <a
              href={project.final_video_url}
              download
              className={buttonVariants({ variant: "outline", size: "sm", className: "px-2" })}
              aria-label={`Download ${project.title}`}
            >
              <DownloadIcon className="size-4" />
            </a>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              onClick={() => onRender(project)}
              disabled={project.status !== "completed" || isRendering}
              aria-label={`Export ${project.title}`}
            >
              {isRendering ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function AiVideoAgentClient() {
  const getAuthHeaders = useAuthHeaders()
  const [projects, setProjects] = React.useState<AiVideoProjectRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [previewProject, setPreviewProject] = React.useState<AiVideoProjectRecord | null>(null)
  const [previewScenes, setPreviewScenes] = React.useState<AiVideoSceneRecord[]>([])
  const [previewAssets, setPreviewAssets] = React.useState<AiVideoAssetRecord[]>([])
  const [renderingId, setRenderingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    void refreshProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const hasProcessing = projects.some(
      (project) => project.status !== "completed" && project.status !== "failed"
    )
    if (!hasProcessing) return

    const interval = setInterval(() => {
      void refreshProjects(false)
    }, 5000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  async function refreshProjects(showSkeleton = true) {
    if (showSkeleton) setIsLoading(true)

    try {
      const response = await fetch("/api/ai-video-agent", {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as AiVideoAgentResponse

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load AI videos.")
      }

      setProjects(data.projects)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load AI videos.")
    } finally {
      if (showSkeleton) setIsLoading(false)
    }
  }

  async function openPreview(project: AiVideoProjectRecord) {
    setPreviewProject(project)
    setPreviewScenes([])
    setPreviewAssets([])

    try {
      const response = await fetch(`/api/ai-video-agent/${project.id}`, {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as {
        project?: AiVideoProjectRecord
        scenes?: AiVideoSceneRecord[]
        assets?: AiVideoAssetRecord[]
        error?: string
      }

      if (!response.ok || !data.project) {
        throw new Error(data.error ?? "Unable to load preview.")
      }

      setPreviewProject(data.project)
      setPreviewScenes(data.scenes ?? [])
      setPreviewAssets(data.assets ?? [])
    } catch (previewError) {
      toast.error(previewError instanceof Error ? previewError.message : "Unable to load preview.")
    }
  }

  async function renderProject(project: AiVideoProjectRecord) {
    setRenderingId(project.id)

    try {
      const response = await fetch(`/api/ai-video-agent/${project.id}/render`, {
        method: "POST",
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as { url?: string; runId?: string; error?: string }

      if (!response.ok || (!data.url && !data.runId)) {
        throw new Error(data.error ?? "Unable to start export.")
      }

      toast.success(data.url ? "Export prepared" : "Export started")
      await refreshProjects(false)
    } catch (renderError) {
      toast.error(renderError instanceof Error ? renderError.message : "Unable to start export.")
    } finally {
      setRenderingId(null)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-3">AI Video Agent</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">AI video projects</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Generate fully edited avatar videos with B-roll, voiceover, captions, and Remotion-ready compositions.
            </p>
          </div>
          <Button size="lg" render={<Link href="/dashboard/ai-video-agent/create" />}>
            <PlusIcon />
            Create Video with AI Agent
          </Button>
        </div>
        <div className="grid border-t border-border bg-muted/30 text-sm sm:grid-cols-4">
          <div className="border-border p-4 sm:border-r">
            <span className="text-muted-foreground">Projects</span>
            <strong className="mt-1 block text-2xl">{projects.length}</strong>
          </div>
          <div className="border-border p-4 sm:border-r">
            <span className="text-muted-foreground">Completed</span>
            <strong className="mt-1 block text-2xl">
              {projects.filter((project) => project.status === "completed").length}
            </strong>
          </div>
          <div className="border-border p-4 sm:border-r">
            <span className="text-muted-foreground">In progress</span>
            <strong className="mt-1 block text-2xl">
              {projects.filter((project) => project.status !== "completed" && project.status !== "failed").length}
            </strong>
          </div>
          <div className="p-4">
            <span className="text-muted-foreground">Rendered</span>
            <strong className="mt-1 block text-2xl">
              {projects.filter((project) => project.final_video_url).length}
            </strong>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="destructive" size="sm" onClick={() => void refreshProjects()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Generated videos</h3>
          <p className="text-sm text-muted-foreground">Preview, reopen, export, or download completed AI videos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshProjects()}>
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingGrid />
      ) : projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onPreview={openPreview}
              onRender={renderProject}
              isRendering={renderingId === project.id}
            />
          ))}
        </div>
      ) : (
        <Empty className="min-h-[380px] border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
              <ClapperboardIcon />
            </EmptyMedia>
            <EmptyTitle>No AI videos yet</EmptyTitle>
            <EmptyDescription>
              Create your first edited AI video with an avatar, voiceover, captions, and generated B-roll.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/dashboard/ai-video-agent/create" />}>
              <SparklesIcon />
              Create Video with AI Agent
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <Dialog open={Boolean(previewProject)} onOpenChange={(open) => !open && setPreviewProject(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewProject?.title ?? "AI video preview"}</DialogTitle>
            <DialogDescription>
              Remotion Player preview using saved scenes, assets, captions, and timing.
            </DialogDescription>
          </DialogHeader>
          {previewProject ? (
            <div
              className={cn(
                "mx-auto overflow-hidden rounded-lg border border-border bg-black w-full",
                previewProject.screen_size === "9:16"
                  ? "h-[70vh] aspect-[9/16] w-auto"
                  : "aspect-video"
              )}
            >
              {previewScenes.length ? (
                <RemotionPlayerPreview
                  project={previewProject}
                  scenes={previewScenes}
                  assets={previewAssets}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-white/70">
                  Loading preview...
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function SelectTile({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected && "border-primary ring-3 ring-primary/20",
        className
      )}
    >
      {selected ? (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3" />
        </span>
      ) : null}
      {children}
    </button>
  )
}

function AvatarSelectCard({
  avatar,
  selected,
  screenSize,
  onSelect,
}: {
  avatar: AvatarRecord
  selected: boolean
  screenSize: AiVideoAgentScreenSize
  onSelect: () => void
}) {
  return (
    <SelectTile selected={selected} onClick={onSelect} className="p-0">
      <div className={cn("overflow-hidden rounded-t-lg bg-muted", screenSize === "9:16" ? "aspect-[9/12]" : "aspect-video")}>
        <MediaImage src={getAvatarImageForAiVideo(avatar, screenSize)} alt={avatar.name} />
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2 pr-5">
          <span className="truncate text-sm font-semibold">{avatar.name}</span>
          {avatar.style ? <Badge variant="secondary">{avatar.style}</Badge> : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground capitalize">{avatar.source} avatar</span>
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <PlayIcon className="size-3" />
            Preview
          </span>
        </div>
      </div>
    </SelectTile>
  )
}

function VoiceSelectCard({
  name,
  type,
  description,
  selected,
  isPlaying,
  onSelect,
  onPreview,
}: {
  name: string
  type: VoiceType
  description: string
  selected: boolean
  isPlaying: boolean
  onSelect: () => void
  onPreview: () => void
}) {
  return (
    <SelectTile selected={selected} onClick={onSelect} className="flex min-w-0 items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 via-teal-400 to-orange-300 text-white">
        <Mic2Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 pr-7">
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
    </SelectTile>
  )
}

function HighlightedCaption({ style }: { style: AiVideoAgentCaptionStyle }) {
  // 3 words: "Create amazing videos" with "amazing" highlighted as the speaking word
  switch (style) {
    case "bold_subtitle":
      return (
        <span className="uppercase">
          CREATE <span className="text-yellow-400">AMAZING</span> VIDEOS
        </span>
      )
    case "minimal_clean":
      return (
        <span>
          Create <span className="text-primary font-bold underline decoration-2">amazing</span> videos
        </span>
      )
    case "podcast":
      return (
        <span>
          Create <span className="text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]">amazing</span> videos
        </span>
      )
    case "tiktok_viral":
      return (
        <span className="uppercase">
          CREATE <span className="text-rose-600 inline-block scale-110 transform font-black drop-shadow">AMAZING</span> VIDEOS
        </span>
      )
    case "gradient_highlight":
      return (
        <span>
          Create <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-black">amazing</span> videos
        </span>
      )
    case "word_by_word":
      return (
        <span>
          Create <span className="text-green-400 underline decoration-green-400 decoration-wavy">amazing</span> videos
        </span>
      )
    default:
      return (
        <span>
          Create <span className="text-primary font-bold">amazing</span> videos
        </span>
      )
  }
}

function CaptionDesignPreview({
  style,
  imageUrl,
  compact = false,
}: {
  style: AiVideoAgentCaptionStyle
  imageUrl?: string | null
  compact?: boolean
}) {
  const bgImage = imageUrl || "/avatars/emma.png"

  return (
    <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden rounded-md border border-white/10 bg-slate-950", compact ? "p-1" : "p-2")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bgImage}
        alt="Preview avatar"
        className="absolute inset-0 size-full object-contain opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

      {/* Absolute positioning to match a real subtitle look */}
      <div className={cn("absolute flex justify-center text-center", compact ? "inset-x-1 bottom-1" : "inset-x-2 bottom-2")}>
        <span
          className={cn(
            "max-w-[90%] shadow-lg text-center tracking-wide leading-normal font-bold",
            captionClass(style),
            compact ? "!text-[8px] !px-1.5 !py-0.5 !leading-none rounded" : "!text-[10px] !px-2 !py-1 !leading-none rounded"
          )}
        >
          <HighlightedCaption style={style} />
        </span>
      </div>
    </div>
  )
}

function LivePreviewPanel({
  project,
  run,
  runState,
  estimatedCredits,
}: {
  project: Pick<
    AiVideoProjectRecord,
    | "title"
    | "duration_seconds"
    | "screen_size"
    | "avatar_name"
    | "avatar_image_url"
    | "voice_name"
    | "caption_style"
    | "broll_style"
    | "captions"
    | "voiceover_url"
  >
  run: RealtimeAiVideoRun
  runState: RunState | null
  estimatedCredits: number
}) {
  const metadata = (run?.metadata ?? {}) as RunMetadata
  const progress = progressFromRun(metadata, Boolean(run?.isExecuting), Boolean(runState))

  return (
    <aside className="space-y-4 lg:h-full lg:overflow-y-auto [scrollbar-width:none]">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Live preview</h3>
            <p className="text-sm text-muted-foreground">
              {formatAiVideoScreenSize(project.screen_size)} · {formatAiVideoDuration(project.duration_seconds)}
            </p>
          </div>
          <Badge variant="secondary">{estimatedCredits} credits</Badge>
        </div>
        <div
          className={cn(
            "mx-auto overflow-hidden rounded-lg border border-border bg-black relative flex items-center justify-center size-full",
            project.screen_size === "9:16" ? "aspect-[9/16] max-h-[620px] w-full" : "aspect-video w-full"
          )}
        >
          {/* Premium blurred backdrop to eliminate empty margins */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaSource(project.avatar_image_url)}
            alt=""
            className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-35 select-none pointer-events-none"
          />

          {/* Main Avatar image focused and fitted */}
          <MediaImage
            src={project.avatar_image_url}
            alt={project.avatar_name}
            objectFit="object-contain"
            className="relative z-10 scale-105 transform"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 z-10" />

          {/* Subtitle Overlay (always shown with HighlightedCaption style inside create page) */}
          <div className="absolute inset-x-[6%] bottom-[8%] flex justify-center text-center z-20">
            <span
              className={cn(
                "max-w-[90%] shadow-2xl text-center tracking-wide leading-normal font-bold",
                captionClass(project.caption_style)
              )}
            >
              <HighlightedCaption style={project.caption_style} />
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Generation flow</h3>
            <p className="text-sm text-muted-foreground">
              {metadata.message ?? "Progress updates will appear here once generation starts."}
            </p>
          </div>
          {run?.isExecuting ? <Loader2Icon className="size-5 animate-spin text-primary" /> : null}
        </div>
        <Progress value={progress} className="mt-4">
          <ProgressLabel className="capitalize">
            {prettyStage(metadata.stage)}
          </ProgressLabel>
        </Progress>
        {metadata.error ? <p className="mt-3 text-sm text-destructive">{metadata.error}</p> : null}
      </div>
    </aside>
  )
}

export function CreateAiVideoAgentClient() {
  const getAuthHeaders = useAuthHeaders()
  const [avatars, setAvatars] = React.useState<AvatarRecord[]>([])
  const [customVoices, setCustomVoices] = React.useState<VoiceRecord[]>([])
  const [defaultVoices, setDefaultVoices] = React.useState<DefaultVoice[]>([])
  const [credits, setCredits] = React.useState<CreditBalance | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isGeneratingScript, setIsGeneratingScript] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [scriptMode, setScriptMode] = React.useState<"manual" | "topic">("manual")
  const [script, setScript] = React.useState("")
  const [topic, setTopic] = React.useState("")
  const [duration, setDuration] = React.useState<AiVideoAgentDuration>(60)
  const [screenSize, setScreenSize] = React.useState<AiVideoAgentScreenSize>("16:9")
  const [selectedAvatarId, setSelectedAvatarId] = React.useState("")
  const [captionStyle, setCaptionStyle] = React.useState<AiVideoAgentCaptionStyle>("bold_subtitle")
  const [selectedVoice, setSelectedVoice] = React.useState<{ id: string; type: VoiceType } | null>(null)
  const [brollStyle, setBrollStyle] = React.useState<AiVideoAgentBrollStyle>("ai_images")
  const [activeRun, setActiveRun] = React.useState<RunState | null>(null)
  const [completedProject, setCompletedProject] = React.useState<AiVideoProjectRecord | null>(null)
  const [playingVoiceId, setPlayingVoiceId] = React.useState<string | null>(null)
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null)

  const { run, error: realtimeError } = useRealtimeRun<typeof generateAiVideoAgentTask>(activeRun?.runId, {
    accessToken: activeRun?.publicAccessToken,
    enabled: Boolean(activeRun?.runId && activeRun.publicAccessToken),
    onComplete: () => {
      setIsSubmitting(false)
      if (run?.isFailed) {
        toast.error("AI video generation failed")
      } else {
        toast.success("AI video project is ready")
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
  const estimatedCredits = calculateAiVideoAgentCredits({ duration, brollStyle })
  const sceneCount = aiVideoAgentSceneCounts[duration]
  const canSubmit =
    Boolean(selectedAvatar) &&
    Boolean(selectedVoice) &&
    (scriptMode === "manual" ? Boolean(script.trim()) : Boolean(topic.trim() || script.trim())) &&
    script.length <= AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS &&
    (credits?.balance ?? 0) >= estimatedCredits &&
    !isSubmitting

  const previewProject =
    completedProject ??
    ({
      title: title.trim() || "AI video preview",
      duration_seconds: duration,
      screen_size: screenSize,
      avatar_name: selectedAvatar?.name ?? "Select avatar",
      avatar_image_url: selectedAvatar
        ? getAvatarImageForAiVideo(selectedAvatar, screenSize)
        : "/avatars/emma.png",
      voice_name: selectedVoiceDetails?.name ?? "Select voice",
      caption_style: captionStyle,
      broll_style: brollStyle,
      captions: null,
      voiceover_url: null,
    } satisfies RemotionPreviewProps["project"])

  React.useEffect(() => {
    void refreshData()
    return () => {
      previewAudioRef.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (realtimeError) toast.error(realtimeError.message)
  }, [realtimeError])

  React.useEffect(() => {
    if (!activeRun || (!run?.isSuccess && !run?.isFailed)) return

    void loadProjectDetails(activeRun.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, run?.isFailed, run?.isSuccess])

  async function refreshData() {
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai-video-agent", {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as AiVideoAgentResponse

      if (!response.ok) throw new Error(data.error ?? "Unable to load AI Video Agent data.")

      setAvatars(data.avatars)
      setCustomVoices(data.customVoices)
      setDefaultVoices(data.defaultVoices)
      setCredits(data.credits)

      if (!selectedAvatarId && data.avatars[0]) setSelectedAvatarId(data.avatars[0].id)
      if (!selectedVoice) {
        const firstCustom = data.customVoices.find((voice) => voice.status === "completed")
        const firstDefault = data.defaultVoices[0]
        if (firstCustom) setSelectedVoice({ id: firstCustom.id, type: "custom" })
        else if (firstDefault) setSelectedVoice({ id: firstDefault.id, type: "default" })
      }
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "Unable to load AI Video Agent data.")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadProjectDetails(projectId: string) {
    try {
      const response = await fetch(`/api/ai-video-agent/${projectId}`, {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as {
        project?: AiVideoProjectRecord
        scenes?: AiVideoSceneRecord[]
        assets?: AiVideoAssetRecord[]
        error?: string
      }

      if (!response.ok || !data.project) throw new Error(data.error ?? "Unable to load project.")

      setCompletedProject(data.project)
      await refreshData()
    } catch (detailsError) {
      toast.error(detailsError instanceof Error ? detailsError.message : "Unable to load project.")
    }
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

    previewAudioRef.current?.pause()
    const audio = new window.Audio(url)
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
      const response = await fetch("/api/ai-video-agent/script", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: topic.trim(), durationSeconds: duration }),
      })
      const data = (await response.json()) as { script?: string; error?: string }

      if (!response.ok || !data.script) throw new Error(data.error ?? "Unable to generate script.")

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
      if (!selectedAvatar) toast.error("Choose an avatar.")
      else if (!selectedVoice) toast.error("Choose a voice.")
      else if (scriptMode === "manual" && !script.trim()) toast.error("Enter a script.")
      else if (scriptMode === "topic" && !topic.trim() && !script.trim()) toast.error("Enter a topic.")
      else if ((credits?.balance ?? 0) < estimatedCredits) toast.error("Not enough credits.")
      return
    }

    setIsSubmitting(true)
    setCompletedProject(null)

    try {
      const response = await fetch("/api/ai-video-agent", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim() || `${selectedAvatar?.name ?? "AI"} video`,
          script,
          scriptMode,
          scriptTopic: scriptMode === "topic" ? topic.trim() : null,
          durationSeconds: duration,
          screenSize,
          avatarId: selectedAvatarId,
          voiceId: selectedVoice.id,
          voiceType: selectedVoice.type,
          captionStyle,
          brollStyle,
        }),
      })
      const data = (await response.json()) as {
        project?: AiVideoProjectRecord
        projectId?: string
        runId?: string
        publicAccessToken?: string
        balance?: number
        error?: string
      }

      if (!response.ok || !data.projectId || !data.runId || !data.publicAccessToken) {
        throw new Error(data.error ?? "Unable to start AI video generation.")
      }

      if (typeof data.balance === "number") {
        const balance = data.balance
        setCredits((current) => (current ? { ...current, balance } : current))
      }

      setActiveRun({
        id: data.projectId,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      toast.loading("AI video generation started", {
        id: `ai-video-agent-${data.projectId}`,
        description: "Credits are deducted up front and refunded if the task fails.",
      })
    } catch (submitError) {
      setIsSubmitting(false)
      toast.error(submitError instanceof Error ? submitError.message : "Unable to start AI video generation.")
    }
  }

  if (isLoading && !avatars.length && !defaultVoices.length) {
    return (
      <section className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Skeleton className="h-[760px] rounded-lg" />
        <Skeleton className="h-[660px] rounded-lg" />
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:h-[calc(100vh-theme(spacing.16)-4rem)] lg:overflow-hidden">
      <div className="space-y-5 lg:h-full lg:overflow-y-auto lg:pr-3 [scrollbar-width:thin]">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="secondary" className="mb-3">Create AI Video Agent</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Generate a complete edited video</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Build an avatar-led video with B-roll, voiceover, captions, scene timing, and a Remotion composition.
              </p>
            </div>
            <Button variant="outline" render={<Link href="/dashboard/ai-video-agent" />}>
              View library
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="video-name">Video name</Label>
              <Input
                id="video-name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Launch promo, tutorial, podcast clip..."
              />
            </div>
            <div className="space-y-2">
              <Label>Video length</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {aiVideoAgentDurations.map((item) => (
                  <SelectTile
                    key={item}
                    selected={duration === item}
                    onClick={() => setDuration(item)}
                    className="flex flex-col items-center justify-center py-4 px-3 text-center"
                  >
                    <span className="block font-bold text-base">{formatAiVideoDuration(item)}</span>
                    <span className="text-xs text-muted-foreground mt-1">{aiVideoAgentSceneCounts[item]} scenes</span>
                  </SelectTile>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Script or topic</h3>
              <p className="text-sm text-muted-foreground">Write manually or generate a duration-aware script from a topic.</p>
            </div>
          </div>
          <Tabs value={scriptMode} onValueChange={(value) => setScriptMode(value as "manual" | "topic")}>
            <TabsList>
              <TabsTrigger value="manual">Manual script</TabsTrigger>
              <TabsTrigger value="topic">AI topic</TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="mt-4">
              <Textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Paste the full voiceover script..."
                className="min-h-44"
              />
            </TabsContent>
            <TabsContent value="topic" className="mt-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Example: How AI agents reduce support workload"
                />
                <Button onClick={() => void generateScript()} disabled={isGeneratingScript}>
                  {isGeneratingScript ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                  Generate
                </Button>
              </div>
              <Textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Generated script will appear here and can be edited."
                className="min-h-44"
              />
            </TabsContent>
          </Tabs>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{script.length.toLocaleString()} / {AI_VIDEO_AGENT_MAX_SCRIPT_CHARACTERS.toLocaleString()} characters</span>
            <span>{scriptMode === "topic" ? "The workflow will use this final script." : "Scene analysis runs after generation starts."}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight">Screen size</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {aiVideoAgentScreenSizes.map((item) => (
              <SelectTile
                key={item}
                selected={screenSize === item}
                onClick={() => setScreenSize(item)}
              >
                <div className="flex items-center gap-3">
                  <span className={cn("rounded-md border border-border bg-muted", item === "16:9" ? "h-12 w-20" : "h-16 w-10")} />
                  <span>
                    <span className="block font-semibold">{formatAiVideoScreenSize(item)}</span>
                    <span className="text-sm text-muted-foreground">Preview updates instantly</span>
                  </span>
                </div>
              </SelectTile>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight">Select video avatar</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {avatars.map((avatar) => (
              <AvatarSelectCard
                key={avatar.id}
                avatar={avatar}
                selected={selectedAvatarId === avatar.id}
                screenSize={screenSize}
                onSelect={() => setSelectedAvatarId(avatar.id)}
              />
            ))}
          </div>
          {!avatars.length ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Create or upload an avatar first from the AI Avatars page.
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight">Select caption design</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {aiVideoAgentCaptionStyles.map((style) => (
              <SelectTile
                key={style}
                selected={captionStyle === style}
                onClick={() => setCaptionStyle(style)}
              >
                <CaptionDesignPreview
                  style={style}
                  imageUrl={selectedAvatar ? getAvatarImageForAiVideo(selectedAvatar, screenSize) : "/avatars/emma.png"}
                />
                <span className="mt-3 block text-sm font-semibold text-center w-full">
                  {formatAiVideoCaptionStyle(style)}
                </span>
              </SelectTile>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight">Select voice</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {allVoices.map((voice) => (
              <VoiceSelectCard
                key={`${voice.type}-${voice.id}`}
                name={voice.name}
                type={voice.type}
                description={voice.description}
                selected={selectedVoice?.id === voice.id && selectedVoice.type === voice.type}
                isPlaying={playingVoiceId === `${voice.type}-${voice.id}`}
                onSelect={() => setSelectedVoice({ id: voice.id, type: voice.type })}
                onPreview={() => togglePlayPreview(`${voice.type}-${voice.id}`, voice.previewUrl)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight">Select B-roll style</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {aiVideoAgentBrollStyles.map((style) => {
              const cost = calculateAiVideoAgentCredits({ duration, brollStyle: style })
              const icon =
                style === "ai_video" ? <FilmIcon /> : style === "illustration_animation" ? <LayoutTemplateIcon /> : <ImageIcon />

              return (
                <SelectTile
                  key={style}
                  selected={brollStyle === style}
                  onClick={() => setBrollStyle(style)}
                >
                  <div className="flex items-start gap-3 pr-7">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {icon}
                    </span>
                    <span>
                      <span className="block font-semibold">{formatAiVideoBrollStyle(style)}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {style === "stock" ? "Free Pixabay media" : `${cost} credits for ${sceneCount} scenes`}
                      </span>
                    </span>
                  </div>
                </SelectTile>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Ready to generate</h3>
              <p className="text-sm text-muted-foreground">
                Estimated cost: {estimatedCredits} credits · {sceneCount} scenes · {formatAiVideoBrollStyle(brollStyle)}
              </p>
            </div>
            <Button size="lg" onClick={() => void submitVideo()} disabled={!canSubmit}>
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Generate Video
            </Button>
          </div>
        </div>
      </div>

      <div className="lg:h-full lg:overflow-hidden">
        <LivePreviewPanel
          project={previewProject}
          run={run}
          runState={activeRun}
          estimatedCredits={estimatedCredits}
        />
      </div>
    </section>
  )
}

type SceneAssetMode = "ai_image" | "ai_video" | "stock" | "illustration" | "avatar_video"

type SceneAssetRunState = {
  sceneId: string
  runId: string
  publicAccessToken: string
}

type RenderRunState = {
  runId: string
  publicAccessToken: string
}

function sceneDuration(scene: AiVideoSceneRecord) {
  return Math.max(0, Number(scene.end_time) - Number(scene.start_time))
}

function formatSeconds(value: number) {
  return `${Number(value.toFixed(1))}s`
}

function aiBrollClipSeconds(scene: AiVideoSceneRecord | null) {
  if (!scene) return 5
  return sceneDuration(scene) <= 5 ? 5 : 10
}

function aiBrollClipCredits(scene: AiVideoSceneRecord | null) {
  return aiBrollClipSeconds(scene) <= 5 ? 5 : 10
}

function SceneThumbnail({
  scene,
  asset,
  project,
}: {
  scene: AiVideoSceneRecord
  asset?: AiVideoAssetRecord
  project: AiVideoProjectRecord
}) {
  if (asset?.asset_type === "remotion_component") {
    return (
      <div className="relative flex size-full items-end overflow-hidden bg-slate-950 p-2 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(20,184,166,0.34),transparent_32%),radial-gradient(circle_at_82%_74%,rgba(249,115,22,0.24),transparent_34%),linear-gradient(135deg,#07111f,#10252f_48%,#211724)]" />
        <div className="absolute right-3 top-3 h-10 w-16 rounded-md border border-white/20 bg-white/10" />
        <div className="relative min-w-0">
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">
            Scene {scene.scene_index + 1}
          </span>
          <p className="mt-1 truncate text-[10px] font-semibold">{scene.title}</p>
        </div>
      </div>
    )
  }

  if (asset?.url && asset.mime_type?.startsWith("video/")) {
    return (
      <div className="relative size-full overflow-hidden bg-slate-950">
        <video
          src={asset.url}
          className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-md"
          muted
          playsInline
          preload="metadata"
        />
        <video
          src={asset.url}
          className="relative z-10 size-full object-contain"
          muted
          playsInline
          preload="metadata"
        />
      </div>
    )
  }

  return (
    <div className="relative size-full overflow-hidden bg-slate-950">
      <MediaImage
        src={asset?.url ?? project.thumbnail_url ?? project.avatar_image_url}
        alt=""
        className="absolute inset-0 scale-110 opacity-35 blur-md"
      />
      <MediaImage
        src={asset?.url ?? project.thumbnail_url ?? project.avatar_image_url}
        alt={scene.title}
        objectFit="object-contain"
        className="relative z-10"
      />
    </div>
  )
}

export function EditAiVideoAgentClient({ projectId }: { projectId: string }) {
  const getAuthHeaders = useAuthHeaders()
  const [project, setProject] = React.useState<AiVideoProjectRecord | null>(null)
  const [scenes, setScenes] = React.useState<AiVideoSceneRecord[]>([])
  const [assets, setAssets] = React.useState<AiVideoAssetRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [captionStyle, setCaptionStyle] = React.useState<AiVideoAgentCaptionStyle>("bold_subtitle")
  const [editingScene, setEditingScene] = React.useState<AiVideoSceneRecord | null>(null)
  const [assetMode, setAssetMode] = React.useState<SceneAssetMode>("ai_image")
  const [assetPrompt, setAssetPrompt] = React.useState("")
  const [assetRun, setAssetRun] = React.useState<SceneAssetRunState | null>(null)
  const [renderRun, setRenderRun] = React.useState<RenderRunState | null>(null)

  const { run: activeAssetRun, error: assetRunError } = useRealtimeRun<typeof editAiVideoSceneAssetTask>(
    assetRun?.runId,
    {
      accessToken: assetRun?.publicAccessToken,
      enabled: Boolean(assetRun?.runId && assetRun.publicAccessToken),
    }
  )
  const { run: activeRenderRun, error: renderRunError } = useRealtimeRun<typeof renderAiVideoAgentTask>(
    renderRun?.runId,
    {
      accessToken: renderRun?.publicAccessToken,
      enabled: Boolean(renderRun?.runId && renderRun.publicAccessToken),
    }
  )

  const loadProject = React.useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setIsLoading(true)

    try {
      const response = await fetch(`/api/ai-video-agent/${projectId}`, {
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as {
        project?: AiVideoProjectRecord
        scenes?: AiVideoSceneRecord[]
        assets?: AiVideoAssetRecord[]
        error?: string
      }

      if (!response.ok || !data.project) throw new Error(data.error ?? "Unable to load video.")

      setProject(data.project)
      setCaptionStyle(data.project.caption_style)
      setScenes(data.scenes ?? [])
      setAssets(data.assets ?? [])
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "Unable to load video.")
    } finally {
      if (showSkeleton) setIsLoading(false)
    }
  }, [getAuthHeaders, projectId])

  React.useEffect(() => {
    queueMicrotask(() => void loadProject())
  }, [loadProject])

  React.useEffect(() => {
    if (assetRunError) toast.error(assetRunError.message)
  }, [assetRunError])

  React.useEffect(() => {
    if (renderRunError) toast.error(renderRunError.message)
  }, [renderRunError])

  React.useEffect(() => {
    if (!assetRun || (!activeAssetRun?.isSuccess && !activeAssetRun?.isFailed)) return

    queueMicrotask(() => {
      if (activeAssetRun.isSuccess) {
        toast.success("Scene updated")
        setEditingScene(null)
        setAssetPrompt("")
        void loadProject(false)
      } else if (activeAssetRun.isFailed) {
        toast.error("Scene update failed")
      }
      setAssetRun(null)
    })
  }, [assetRun, activeAssetRun?.isSuccess, activeAssetRun?.isFailed, loadProject])

  React.useEffect(() => {
    if (!renderRun || (!activeRenderRun?.isSuccess && !activeRenderRun?.isFailed)) return

    queueMicrotask(() => {
      if (activeRenderRun.isSuccess) {
        toast.success("Updated video exported")
        void loadProject(false)
      } else if (activeRenderRun.isFailed) {
        toast.error("Video export failed")
      }
      setRenderRun(null)
    })
  }, [renderRun, activeRenderRun?.isSuccess, activeRenderRun?.isFailed, loadProject])

  async function saveCaptionStyle(nextStyle = captionStyle) {
    if (!project) return
    setIsSaving(true)

    try {
      const response = await fetch(`/api/ai-video-agent/${project.id}`, {
        method: "PATCH",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ captionStyle: nextStyle }),
      })
      const data = (await response.json()) as {
        project?: AiVideoProjectRecord
        scenes?: AiVideoSceneRecord[]
        assets?: AiVideoAssetRecord[]
        error?: string
      }

      if (!response.ok || !data.project) throw new Error(data.error ?? "Unable to save changes.")

      setProject(data.project)
      setCaptionStyle(data.project.caption_style)
      setScenes(data.scenes ?? scenes)
      setAssets(data.assets ?? assets)
      toast.success("Changes saved")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save changes.")
    } finally {
      setIsSaving(false)
    }
  }

  async function submitSceneAsset() {
    if (!project || !editingScene) return
    const prompt = assetPrompt.trim() || editingScene.visual_prompt || editingScene.summary

    try {
      const response = await fetch(`/api/ai-video-agent/${project.id}/scenes/${editingScene.id}/asset`, {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: assetMode, prompt }),
      })
      const data = (await response.json()) as {
        runId?: string
        publicAccessToken?: string
        clipSeconds?: number
        credits?: number
        error?: string
      }

      if (!response.ok || !data.runId || !data.publicAccessToken) {
        throw new Error(data.error ?? "Unable to start scene update.")
      }

      setAssetRun({
        sceneId: editingScene.id,
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      toast.loading("Scene update started", {
        id: `scene-asset-${editingScene.id}`,
        description:
          assetMode === "ai_video"
            ? `${data.clipSeconds ?? aiBrollClipSeconds(editingScene)}s max AI B-roll. ${data.credits ?? aiBrollClipCredits(editingScene)} credits will be charged.`
            : "The preview will refresh when the new asset is ready.",
      })
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Unable to start scene update.")
    }
  }

  async function exportUpdatedVideo() {
    if (!project) return

    try {
      const response = await fetch(`/api/ai-video-agent/${project.id}/render`, {
        method: "POST",
        headers: await getAuthHeaders(),
      })
      const data = (await response.json()) as {
        runId?: string
        publicAccessToken?: string
        error?: string
      }

      if (!response.ok || !data.runId || !data.publicAccessToken) {
        throw new Error(data.error ?? "Unable to start export.")
      }

      setRenderRun({
        runId: data.runId,
        publicAccessToken: data.publicAccessToken,
      })
      toast.loading("Rendering updated video", {
        id: `render-ai-video-${project.id}`,
        description: "The MP4 will appear here when rendering finishes.",
      })
    } catch (renderError) {
      toast.error(renderError instanceof Error ? renderError.message : "Unable to start export.")
    }
  }

  const assetProgress = (activeAssetRun?.metadata ?? {}) as RunMetadata
  const renderProgress = (activeRenderRun?.metadata ?? {}) as RunMetadata

  if (isLoading || !project) {
    return (
      <section className="mx-auto grid h-[calc(100vh-theme(spacing.16)-1rem)] w-full max-w-7xl gap-3 overflow-hidden lg:grid-cols-[170px_minmax(0,1fr)]">
        <Skeleton className="h-full rounded-lg" />
        <Skeleton className="h-full rounded-lg" />
      </section>
    )
  }

  return (
    <section className="mx-auto grid h-[calc(100vh-theme(spacing.16)-1rem)] w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Button variant="outline" size="sm" render={<Link href="/dashboard/ai-video-agent" />}>
            Back to library
          </Button>
          <h2 className="mt-2 truncate text-xl font-semibold tracking-tight md:text-2xl">{project.title}</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Edit scenes, caption design, and export an updated MP4.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void saveCaptionStyle()} disabled={isSaving}>
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Save Changes
          </Button>
          <Button size="sm" onClick={() => void exportUpdatedVideo()} disabled={Boolean(renderRun)}>
            {renderRun ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            Export Updated Video
          </Button>
          {project.final_video_url ? (
            <a href={project.final_video_url} download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <DownloadIcon />
              Download MP4
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[170px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-2 shadow-sm">
          <div className="shrink-0">
            <h3 className="text-sm font-semibold tracking-tight">Caption style</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Full video.</p>
          </div>
          <ScrollArea className="mt-2 min-h-0 flex-1 pr-2">
            <div className="grid grid-cols-2 gap-1.5 pb-1 lg:grid-cols-1">
              {aiVideoAgentCaptionStyles.map((style) => (
                <SelectTile
                  key={style}
                  selected={captionStyle === style}
                  onClick={() => {
                    setCaptionStyle(style)
                    setProject((current) =>
                      current
                        ? {
                            ...current,
                            caption_style: style,
                            captions: current.captions?.map((caption) => ({ ...caption, style })) ?? null,
                          }
                        : current
                    )
                  }}
                  className="p-1.5"
                >
                  <CaptionDesignPreview style={style} imageUrl={project.avatar_image_url} compact />
                  <span className="mt-1 block truncate text-[11px] font-semibold">
                    {formatAiVideoCaptionStyle(style)}
                  </span>
                </SelectTile>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div
            className={cn(
              "flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border bg-muted/30 p-2 shadow-sm"
            )}
          >
            <div
              className={cn(
                "overflow-hidden rounded-lg bg-black shadow-sm",
                project.screen_size === "9:16"
                  ? "aspect-[9/16] h-full max-h-[66vh] w-auto"
                  : "aspect-video h-auto max-h-[66vh] w-full max-w-[1180px]"
              )}
            >
              <RemotionPlayerPreview project={project} scenes={scenes} assets={assets} />
            </div>
          </div>

          {assetRun ? (
            <div className="mt-2 shrink-0 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{assetProgress.message ?? "Updating scene asset..."}</span>
                <Loader2Icon className="size-4 animate-spin text-primary" />
              </div>
              <Progress value={progressFromRun(assetProgress, Boolean(activeAssetRun?.isExecuting), true)} className="mt-2">
                <ProgressLabel className="capitalize">{prettyStage(assetProgress.stage)}</ProgressLabel>
              </Progress>
            </div>
          ) : null}

          {renderRun ? (
            <div className="mt-2 shrink-0 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{renderProgress.message ?? "Rendering updated MP4..."}</span>
                <Loader2Icon className="size-4 animate-spin text-primary" />
              </div>
              <Progress value={progressFromRun(renderProgress, Boolean(activeRenderRun?.isExecuting), true)} className="mt-2">
                <ProgressLabel className="capitalize">{prettyStage(renderProgress.stage)}</ProgressLabel>
              </Progress>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 shrink-0 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Scene timeline</h3>
            <p className="text-xs text-muted-foreground">Replace individual scene media without changing timing.</p>
          </div>
          <Badge variant="secondary">{scenes.length} scenes</Badge>
        </div>
        {scenes.length ? (
          <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {scenes.map((scene) => {
              const asset = getSceneAsset(assets, scene.id)

              return (
                <article
                  key={scene.id}
                  className="w-[164px] shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-background shadow-xs"
                >
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    <SceneThumbnail scene={scene} asset={asset} project={project} />
                    <Badge className="absolute left-1 top-1 bg-background/90 px-1 py-0 text-[9px] text-foreground">
                      Scene {scene.scene_index + 1}
                    </Badge>
                  </div>
                  <div className="grid h-[64px] grid-rows-[minmax(0,1fr)_auto] gap-1.5 p-1.5">
                    <div className="min-w-0">
                      <h4 className="truncate text-[11px] font-semibold" title={scene.title}>{scene.title}</h4>
                      <p className="text-[10px] text-muted-foreground">{formatSeconds(sceneDuration(scene))}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-full text-[11px]"
                      onClick={() => {
                        setEditingScene(scene)
                        setAssetPrompt(scene.visual_prompt ?? scene.summary)
                        setAssetMode("ai_image")
                      }}
                    >
                      <Edit3Icon />
                      Edit
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex h-[116px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No scenes are available for this video yet.
          </div>
        )}
      </div>

      <Dialog open={Boolean(editingScene)} onOpenChange={(open) => !open && setEditingScene(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingScene ? `Edit Scene ${editingScene.scene_index + 1}` : "Edit scene"}</DialogTitle>
            <DialogDescription>Generate or select replacement media for this scene. Timing stays unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={assetMode} onValueChange={(value) => setAssetMode(value as SceneAssetMode)}>
              <TabsList className="flex h-auto flex-wrap">
                <TabsTrigger value="ai_image">AI image</TabsTrigger>
                <TabsTrigger value="ai_video">AI video</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
                <TabsTrigger value="illustration">Illustration</TabsTrigger>
                <TabsTrigger value="avatar_video">Avatar video</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-2">
              <Label htmlFor="scene-asset-prompt">Prompt or search</Label>
              <Textarea
                id="scene-asset-prompt"
                value={assetPrompt}
                onChange={(event) => setAssetPrompt(event.target.value)}
                className="min-h-32"
                placeholder="Describe the replacement scene asset..."
              />
              {assetMode === "ai_video" ? (
                <p className="text-xs text-muted-foreground">
                  Generates a {aiBrollClipSeconds(editingScene)}s max AI B-roll clip and deducts {aiBrollClipCredits(editingScene)} credits when the job starts. Credits are refunded if generation fails.
                </p>
              ) : null}
              {assetMode === "avatar_video" ? (
                <p className="text-xs text-muted-foreground">
                  Avatar clips use this scene voice duration, capped at 5 seconds, with the project voice.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingScene(null)}>Cancel</Button>
              <Button onClick={() => void submitSceneAsset()} disabled={Boolean(assetRun)}>
                {assetRun ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                Replace Scene Asset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
