"use client"

import {
  ActivityIcon,
  ArrowUpRightIcon,
  BellIcon,
  BotIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  CommandIcon,
  CpuIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { syncUserProfile } from "@/lib/auth/sync-user"
import { cn } from "@/lib/utils"
import { insforge } from "@/lib/insforge/client"

type StudioUser = {
  id?: string
  email?: string
  profile?: {
    name?: string
    avatar_url?: string
  } | null
}

const navItems = [
  { label: "Overview", icon: LayoutDashboardIcon, active: true },
  { label: "Agents", icon: BotIcon },
  { label: "Workflows", icon: WorkflowIcon },
  { label: "Prompt Library", icon: FileTextIcon },
  { label: "Team", icon: UsersIcon },
  { label: "Settings", icon: SettingsIcon },
]

const stats = [
  {
    label: "Model spend",
    value: "$8,420",
    change: "+12.4%",
    icon: CircleDollarSignIcon,
    tone: "bg-primary/12 text-primary",
  },
  {
    label: "Active agents",
    value: "42",
    change: "+8 this week",
    icon: BotIcon,
    tone: "bg-accent/20 text-accent-foreground",
  },
  {
    label: "Workflow runs",
    value: "18.6k",
    change: "99.2% success",
    icon: ActivityIcon,
    tone: "bg-chart-3/20 text-foreground",
  },
  {
    label: "Avg latency",
    value: "740ms",
    change: "-18% faster",
    icon: Clock3Icon,
    tone: "bg-chart-4/20 text-foreground",
  },
]

const usage = [42, 58, 46, 72, 64, 88, 76, 94, 69, 82, 91, 78]

const workspaces = [
  ["Research Copilot", "GPT-5 routing", "Live", "2m ago"],
  ["Support Summarizer", "Claude fallback", "Healthy", "12m ago"],
  ["Sales Briefing Agent", "RAG pipeline", "Training", "36m ago"],
  ["Churn Risk Monitor", "Batch workflow", "Review", "1h ago"],
]

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto flex max-w-7xl gap-6">
        <Skeleton className="hidden h-[calc(100vh-3rem)] w-64 rounded-2xl lg:block" />
        <div className="flex-1 space-y-6">
          <Skeleton className="h-16 rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_20%,transparent),color-mix(in_oklab,var(--accent)_18%,transparent),transparent_70%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] gap-4 p-3 sm:p-4 lg:p-5">
        <aside className="hidden w-72 shrink-0 rounded-2xl border border-sidebar-border bg-sidebar/90 p-4 text-sidebar-foreground shadow-xl shadow-primary/5 backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex size-11 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground shadow-lg shadow-primary/20">
              AI
            </div>
            <div>
              <p className="font-semibold tracking-tight">Kravix Studio</p>
              <p className="text-xs text-muted-foreground">Production AI ops</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  item.active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/15"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl border border-sidebar-border bg-background/50 p-4">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <SparklesIcon className="size-5" />
            </div>
            <p className="text-sm font-semibold">Scale plan readiness</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your agents are ready for higher concurrency and budget alerts.
            </p>
            <Button className="mt-4 w-full rounded-xl" size="sm">
              Review plan
            </Button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="mb-4 flex items-center gap-3 rounded-2xl border border-border/80 bg-card/85 p-3 shadow-xl shadow-primary/5 backdrop-blur-xl">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full lg:hidden"
              aria-label="Open navigation"
            >
              <PanelLeftIcon />
            </Button>
            <div className="relative hidden flex-1 md:block">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-full border-transparent bg-muted/70 pl-10 pr-24 shadow-none"
                placeholder="Search agents, workflows, prompts..."
              />
              <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground lg:flex">
                <CommandIcon className="size-3" /> K
              </div>
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

          <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-xl shadow-primary/5 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
              <div>
                <Badge className="mb-4 rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                  AI Studio dashboard
                </Badge>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  Monitor the workflows turning your AI ideas into production.
                </h1>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Track agent quality, model usage, spend, and team activity
                  from one polished command center.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="rounded-xl">
                  View reports
                </Button>
                <Button className="rounded-xl shadow-lg shadow-primary/20">
                  New workflow
                  <ArrowUpRightIcon />
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-border/70 bg-background/65 p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className={cn("rounded-xl p-2.5", stat.tone)}>
                      <stat.icon className="size-5" />
                    </div>
                    <MoreHorizontalIcon className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-5 text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <p className="text-3xl font-semibold tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-sm font-medium text-primary">
                      {stat.change}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <section className="rounded-2xl border border-border/70 bg-background/65 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      Model usage
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Tokens consumed across active agents
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full">
                    Last 12 days
                  </Badge>
                </div>
                <div className="mt-8 flex h-64 items-end gap-2 sm:gap-3">
                  {usage.map((height, index) => (
                    <div key={index} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-xl bg-[linear-gradient(180deg,var(--primary),var(--accent))] shadow-lg shadow-primary/10"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-background/65 p-5 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight">
                  Quality pulse
                </h2>
                <p className="text-sm text-muted-foreground">
                  Recent evals and production confidence.
                </p>
                <div className="mt-6 space-y-4">
                  {[
                    ["Prompt drift", "Low", "92% stable"],
                    ["Human review", "Medium", "18 items"],
                    ["Fallback rate", "Healthy", "1.8%"],
                  ].map(([label, state, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{state}</p>
                      </div>
                      <p className="text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-2xl border border-border/70 bg-background/65 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/70 p-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Recent workspaces
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Live AI systems and operational status.
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="rounded-xl">
                  View all
                  <ChevronRightIcon />
                </Button>
              </div>
              <div className="divide-y divide-border/70">
                {workspaces.map(([name, model, status, updated]) => (
                  <div
                    key={name}
                    className="grid gap-3 p-5 text-sm sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <MessageSquareTextIcon className="size-5" />
                      </div>
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-muted-foreground">Workspace</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CpuIcon className="size-4" />
                      {model}
                    </div>
                    <Badge className="w-fit rounded-full bg-accent/20 text-accent-foreground hover:bg-accent/20">
                      {status}
                    </Badge>
                    <p className="text-muted-foreground">{updated}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
