"use client"

import {
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
  SearchIcon,
  SettingsIcon,
  UserRoundIcon,
  WandSparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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

export type DashboardUser = {
  id: string
  email?: string
  profile?: {
    name?: string
    avatar_url?: string
  } | null
}

type DashboardShellProps = {
  children:
    | React.ReactNode
    | ((context: {
        user: DashboardUser
        userCredits: number
        setUserCredits: React.Dispatch<React.SetStateAction<number>>
      }) => React.ReactNode)
  mobileSubtitle?: string
}

const navigationItems = [
  { label: "Home", icon: HomeIcon, href: "/" },
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

function initials(user: DashboardUser | null) {
  const name = user?.profile?.name ?? user?.email ?? "AI"

  return name
    .split(/[ @.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function SidebarContent({ userCredits }: { userCredits: number }) {
  const pathname = usePathname()

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
        {navigationItems.map((item) => {
          const active = pathname === item.href

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/15"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-sidebar-border bg-background/55 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary" />
              <span className="text-sm font-semibold">Credits Remaining</span>
            </div>
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              {userCredits}
            </Badge>
          </div>
          <Progress value={Math.min(userCredits, 100)} className="h-2" />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Credits are reserved when a generation is queued.
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

export function DashboardShell({
  children,
  mobileSubtitle = "Home dashboard",
}: DashboardShellProps) {
  const router = useRouter()
  const [user, setUser] = React.useState<DashboardUser | null>(null)
  const [userCredits, setUserCredits] = React.useState(100)
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
      setUser(data.user as DashboardUser)

      const { data: profile } = await insforge.database
        .from("users")
        .select("credits")
        .eq("id", data.user.id)
        .single()

      if (!active) return

      setUserCredits(Number(profile?.credits ?? 100))
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

  if (loading || !user) {
    return <DashboardSkeleton />
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-80 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_18%,transparent),color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] gap-4 p-3 sm:p-4 lg:p-5">
        <aside className="fixed bottom-5 top-5 z-40 hidden w-72 shrink-0 rounded-2xl border border-sidebar-border bg-sidebar/92 p-4 text-sidebar-foreground shadow-xl shadow-primary/5 backdrop-blur-xl lg:block">
          <SidebarContent userCredits={userCredits} />
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
              <SheetContent
                side="left"
                className="w-[320px] bg-sidebar p-4 text-sidebar-foreground"
                showCloseButton={false}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Dashboard navigation</SheetTitle>
                </SheetHeader>
                <SidebarContent userCredits={userCredits} />
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
              <p className="text-xs text-muted-foreground">{mobileSubtitle}</p>
            </div>
            <Badge
              variant="outline"
              className="hidden h-9 gap-2 rounded-full px-3 sm:inline-flex"
            >
              <CreditCardIcon className="size-3.5 text-primary" />
              {userCredits} credits
            </Badge>
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
                      {user.profile?.name ?? user.email}
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
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

          {typeof children === "function"
            ? children({ user, userCredits, setUserCredits })
            : children}
        </section>
      </div>
    </main>
  )
}
