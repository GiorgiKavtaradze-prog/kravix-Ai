"use client"

import {
  BadgeDollarSignIcon,
  BotIcon,
  HomeIcon,
  LibraryIcon,
  Mic2Icon,
  SparklesIcon,
  UserRoundIcon,
  VideoIcon,
  LogOutIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import type { ComponentType, SVGProps } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getCurrentUserProfile } from "@/lib/insforge/sync-user-profile"
import { insforge } from "@/lib/insforge/client"
import { Button } from "@/components/ui/button"
import type { UserProfile } from "@/lib/users"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

type DashboardNavItem = {
  name: string
  href: string
  icon: IconComponent
}

export const dashboardNavigationItems: DashboardNavItem[] = [
  {
    name: "Home",
    href: "/dashboard",
    icon: HomeIcon,
  },
  {
    name: "AI Video Agent",
    href: "/dashboard/ai-video-agent",
    icon: BotIcon,
  },
  {
    name: "AI Video Avatar",
    href: "/dashboard/ai-video-avatar",
    icon: VideoIcon,
  },
  {
    name: "AI Avatars",
    href: "/dashboard/avatar",
    icon: UserRoundIcon,
  },
  {
    name: "AI Voice Cloning",
    href: "/dashboard/ai-voice-cloning",
    icon: Mic2Icon,
  },
  {
    name: "My Library",
    href: "/dashboard/library",
    icon: LibraryIcon,
  },
]

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function getInitials(profile: UserProfile | null) {
  const value = profile?.name ?? profile?.email ?? "User"
  const parts = value.split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return value.slice(0, 2).toUpperCase()
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const [profile, setProfile] = React.useState<UserProfile | null>(null)

  React.useEffect(() => {
    let isMounted = true

    async function loadProfile() {
      const userProfile = await getCurrentUserProfile()

      if (isMounted) {
        setProfile(userProfile)
      }
    }

    void loadProfile().catch(() => {
      if (isMounted) {
        setProfile(null)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar/95"
    >
      <SidebarHeader className="p-4">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sidebar-foreground"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <SparklesIcon className="size-4" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold">
              Kravix AI Studio
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/60">
              Creator dashboard
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardNavigationItems.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={isActiveRoute(pathname, item.href)}
                    size="lg"
                    tooltip={item.name}
                    className="rounded-lg px-3 text-base [&_svg]:size-5"
                    render={
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.name}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="space-y-2 group-data-[collapsible=icon]:hidden">
          <div className="flex gap-2">
            <Link
              href="/dashboard/profile"
              className="flex-1 flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 text-sm text-sidebar-foreground transition hover:bg-sidebar-accent min-w-0"
            >
              <Avatar className="size-10" size="lg">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={profile.name ?? "User"} />
                ) : null}
                <AvatarFallback>{getInitials(profile)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {profile?.name ?? "Profile settings"}
                </span>
                <span className="block truncate text-xs text-sidebar-foreground/60">
                  {profile?.email ?? "Manage your profile"}
                </span>
              </span>
            </Link>
            <Button
              variant="outline"
              size="icon"
              className="size-11 rounded-lg border-sidebar-border bg-sidebar-accent/50 hover:bg-destructive hover:text-destructive-foreground text-sidebar-foreground"
              onClick={async () => {
                await insforge.auth.signOut()
                window.location.href = "/sign-in"
              }}
              title="Sign out"
            >
              <LogOutIcon className="size-5" />
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-sidebar-border bg-background/55 p-3 text-sm">
            <span className="flex items-center gap-3 text-sidebar-foreground/75">
              <BadgeDollarSignIcon className="size-4" />
              Available credits
            </span>
            <span className="font-semibold text-sidebar-foreground">2,480</span>
          </div>
        </div>
        <div className="hidden flex-col items-center gap-2 group-data-[collapsible=icon]:flex">
          <Link
            href="/dashboard/profile"
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="User profile settings"
          >
            {profile?.avatar_url ? (
              <Avatar className="size-8">
                <AvatarImage src={profile.avatar_url} alt={profile.name ?? "User"} />
                <AvatarFallback>{getInitials(profile)}</AvatarFallback>
              </Avatar>
            ) : (
              <UserRoundIcon className="size-4" />
            )}
          </Link>
          <div
            className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground"
            aria-label="Available credits"
          >
            <BadgeDollarSignIcon className="size-4" />
          </div>
          <button
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground transition"
            onClick={async () => {
              await insforge.auth.signOut()
              window.location.href = "/sign-in"
            }}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
