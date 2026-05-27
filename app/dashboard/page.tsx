import {
  BotIcon,
  ClapperboardIcon,
  LibraryIcon,
  Mic2Icon,
  UserRoundIcon,
  VideoIcon,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { ComponentType, SVGProps } from "react"

import { cn } from "@/lib/utils"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

type FeatureCard = {
  name: string
  description: string
  href: string
  media: string
  mediaType: "image" | "video"
  icon: IconComponent
  className?: string
}

const featureCards: FeatureCard[] = [
  {
    name: "AI Video Agent",
    description:
      "Create guided video workflows with an intelligent on-screen agent.",
    href: "/dashboard/ai-video-agent",
    media: "/ai-video-agent.mp4",
    mediaType: "video",
    icon: BotIcon,
    className: "md:col-span-2 md:row-span-2",
  },
  {
    name: "AI Video Avatar",
    description: "Generate lifelike presenter videos from a script or brief.",
    href: "/dashboard/ai-video-avatar",
    media: "/avatar.mp4",
    mediaType: "video",
    icon: VideoIcon,
  },
  {
    name: "AI Avatars",
    description: "Design and manage branded avatars for every campaign.",
    href: "/dashboard/avatar",
    media: "/ai-avatar.mp4",
    mediaType: "video",
    icon: UserRoundIcon,
  },
  {
    name: "AI Voice Cloning",
    description: "Clone voices for polished narration and product content.",
    href: "/dashboard/ai-voice-cloning",
    media: "/voice-cloning.png",
    mediaType: "image",
    icon: Mic2Icon,
    className: "md:col-span-2",
  },
  {
    name: "My Library",
    description: "Browse saved videos, avatars, voices, and generated assets.",
    href: "/dashboard/library",
    media: "/my-library.mp4",
    mediaType: "video",
    icon: LibraryIcon,
  },
]

function FeatureMedia({ feature }: { feature: FeatureCard }) {
  if (feature.mediaType === "video") {
    return (
      <video
        className="absolute inset-0 size-full object-cover"
        src={feature.media}
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return (
    <Image
      src={feature.media}
      alt=""
      fill
      sizes="(min-width: 1024px) 42vw, (min-width: 768px) 50vw, 100vw"
      className="object-cover"
      priority={feature.name === "AI Voice Cloning"}
    />
  )
}

export default function DashboardPage() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex w-fit items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <ClapperboardIcon className="size-3.5 text-primary" />
          AI production suite
        </div>
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Build your next AI media workflow.
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Launch video agents, avatars, cloned voices, and saved assets from
            one focused workspace.
          </p>
        </div>
      </div>

      <div className="grid auto-rows-[18rem] grid-cols-1 gap-4 md:grid-cols-4 lg:auto-rows-[16rem]">
        {featureCards.map((feature) => (
          <Link
            key={feature.name}
            href={feature.href}
            className={cn(
              "group relative isolate overflow-hidden rounded-xl border border-white/10 bg-card shadow-xl shadow-primary/5 outline-none transition duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:ring-2 focus-visible:ring-ring",
              feature.className
            )}
          >
            <FeatureMedia feature={feature} />
            <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/50 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="relative flex h-full flex-col justify-between p-5 text-white sm:p-6">
              <span className="flex size-11 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/20 backdrop-blur transition group-hover:bg-white/25">
                <feature.icon className="size-5" />
              </span>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">
                  {feature.name}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/78">
                  {feature.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
