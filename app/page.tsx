"use client"

import {
  ArrowRightIcon,
  BellIcon,
  BookOpenIcon,
  ClapperboardIcon,
  CreditCardIcon,
  FilesIcon,
  HomeIcon,
  ImageIcon,
  LibraryIcon,
  LogOutIcon,
  MenuIcon,
  Mic2Icon,
  UserRoundIcon,
  SearchIcon,
  SettingsIcon,
  WandSparklesIcon,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { syncUserProfile } from "@/lib/auth/sync-user"
import { insforge } from "@/lib/insforge/client"
import { cn } from "@/lib/utils"

type StudioUser = {
  id?: string
  email?: string
  profile?: {
    name?: string
    avatar_url?: string
  } | null
}

const navigationItems = [
  { label: "Home", icon: HomeIcon, href: "/", active: true },
  { label: "AI Video", icon: ClapperboardIcon, href: "/" },
  { label: "AI Images", icon: ImageIcon, href: "/ai-images" },
  { label: "AI Video Agent", icon: WandSparklesIcon, href: "/" },
  { label: "AI Voice", icon: Mic2Icon, href: "/" },
  { label: "AI Avatar", icon: UserRoundIcon, href: "/" },
  { label: "AI Templates", icon: FilesIcon, href: "/" },
  { label: "My Library", icon: LibraryIcon, href: "/" },
]

const utilityItems = [
  { label: "API Docs", icon: BookOpenIcon },
  { label: "Profile Settings", icon: SettingsIcon },
]

const featureCards = [

  {
    title: "AI Images",
    description: "Create polished visuals, ads, thumbnails, and concept art in seconds.",
    icon: ImageIcon,
    cta: "Create Now",
    size: "lg:col-span-2",
    media: { src: "/image-to-video.mp4", type: "video" },
  },
  {
    title: "AI Video",
    description: "Generate cinematic clips, product demos, and campaign edits from text prompts.",
    icon: ClapperboardIcon,
    cta: "Create Now",
    size: "",
    media: { src: "/text-to-video.mp4", type: "video" },
  },
  {
    title: "AI Voice",
    description: "Produce natural voiceovers, narration, and branded audio snippets.",
    icon: Mic2Icon,
    cta: "Create Now",
    size: "",
    media: { src: "/ai-voice.png", type: "image" },
  },
  {
    title: "AI Video Agent",
    description: "Let an autonomous agent storyboard, generate, and refine video assets.",
    icon: WandSparklesIcon,
    cta: "Launch Agent",
    size: "lg:col-span-2",
    media: { src: "/ai-video-agent.mp4", type: "video" },
  },

  {
    title: "AI Templates",
    description: "Start faster with prompt systems for ads, launches, education, and social.",
    icon: FilesIcon,
    cta: "Explore",
    size: "",
    media: { src: "/ai-templates.mp4", type: "video" },
  },
  {
    title: "AI Avatar",
    description: "Create expressive talking avatars for walkthroughs, explainers, and social videos.",
    icon: UserRoundIcon,
    cta: "Create Avatar",
    size: "lg:col-span-1",
    media: { src: "/avatar.mp4", type: "video" },
  },
]

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-background p-4">
      <div className="mx-auto flex max-w-[1500px] gap-5">
        <Skeleton className="hidden h-[calc(100vh-2rem)] w-72 rounded-2xl lg:block" />
        <div className="flex-1 space-y-5">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

function initials(user: StudioUser | null) {
  const name = user?.profile?.name ?? user?.email ?? "AI"
  return name
    .split(/[ @.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2 pb-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground shadow-lg shadow-primary/20">
          KA
        </div>
        <div>
          <p className="font-semibold tracking-tight">Kravix Studio</p>
          <p className="text-xs text-muted-foreground">Creative AI suite</p>
        </div>
      </div>

      <nav className="space-y-1">
        {navigationItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
              item.active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/15"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-sidebar-border bg-background/55 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary" />
              <span className="text-sm font-semibold">Credits Remaining</span>
            </div>
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              12.4k
            </Badge>
          </div>
          <Progress value={68} className="h-2" />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            68% of this month&apos;s studio credits are still available.
          </p>
        </div>

        <div className="space-y-1">
          {utilityItems.map((item) => (
            <button
              key={item.label}
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ feature }: { feature: (typeof featureCards)[number] }) {
  const isVideo = feature.media.type === "video"
  const href = feature.title === "AI Images" ? "/ai-images" : "/"

  return (
    <article
      className={cn(
        "group relative min-h-[360px] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-2xl hover:shadow-primary/10",
        feature.size
      )}
    >
      {isVideo ? (
        <video
          className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
          src={feature.media.src}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <Image
          className="object-cover transition duration-500 group-hover:scale-105"
          src={feature.media.src}
          alt={`${feature.title} preview`}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_18%,transparent)_0%,color-mix(in_oklab,var(--background)_24%,transparent)_35%,color-mix(in_oklab,var(--background)_90%,transparent)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(circle_at_18%_100%,color-mix(in_oklab,var(--primary)_34%,transparent),transparent_42%),radial-gradient(circle_at_86%_88%,color-mix(in_oklab,var(--accent)_30%,transparent),transparent_38%)]" />
      <div className="relative flex h-full min-h-[360px] flex-col justify-between p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border border-border/40 bg-background/70 text-primary shadow-sm backdrop-blur-md">
            <feature.icon className="size-5" />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full bg-background/75 shadow-sm backdrop-blur-md"
            render={<Link href={href} />}
          >
            {feature.cta}
            <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
          </Button>
        </div>
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-foreground">
            {feature.title}
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {feature.description}
          </p>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = React.useState<StudioUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true

    async function loadUser() {
      const { data } = await insforge.auth.getCurrentUser()
      if (!active) return

      if (!data.user) {
        router.replace("/sign-in")
        return
      }

      await syncUserProfile(data.user, "session")
      setUser(data.user as StudioUser)
      setLoading(false)
    }

    loadUser()

    return () => {
      active = false
    }
  }, [router])

  async function handleSignOut() {
    await insforge.auth.signOut()
    router.replace("/sign-in")
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-80 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_18%,transparent),color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] gap-4 p-3 sm:p-4 lg:p-5">
        <aside className="fixed bottom-5 top-5 z-40 hidden w-72 shrink-0 rounded-2xl border border-sidebar-border bg-sidebar/92 p-4 text-sidebar-foreground shadow-xl shadow-primary/5 backdrop-blur-xl lg:block">
          <SidebarContent />
        </aside>

        <section className="min-w-0 flex-1 lg:ml-[19rem]">
          <header className="sticky top-3 z-30 mb-4 flex items-center gap-3 rounded-2xl border border-border/80 bg-card/88 p-3 shadow-xl shadow-primary/5 backdrop-blur-xl lg:top-5">
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full lg:hidden"
                    aria-label="Open navigation"
                  />
                }
              >
                <MenuIcon />
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] bg-sidebar p-4 text-sidebar-foreground" showCloseButton={false}>
                <SheetHeader className="sr-only">
                  <SheetTitle>Dashboard navigation</SheetTitle>
                </SheetHeader>
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <div className="relative hidden flex-1 md:block">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-full border-transparent bg-muted/70 pl-10 shadow-none"
                placeholder="Search creations, templates, agents..."
              />
            </div>
            <div className="min-w-0 flex-1 md:hidden">
              <p className="truncate text-sm font-semibold">Kravix AI Studio</p>
              <p className="text-xs text-muted-foreground">Home dashboard</p>
            </div>
            <Button variant="outline" size="icon" className="rounded-full">
              <BellIcon />
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-11 gap-3 rounded-full px-2 pr-3"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                        {initials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">
                      {user?.profile?.name ?? user?.email}
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <SettingsIcon />
                    Account settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleSignOut}
                  >
                    <LogOutIcon />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <div className="space-y-4">


            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
