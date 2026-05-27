"use client"

import {
  BadgeDollarSignIcon,
  BotIcon,
  CreditCardIcon,
  HomeIcon,
  LibraryIcon,
  Mic2Icon,
  SparklesIcon,
  UserRoundIcon,
  VideoIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, SVGProps } from "react"

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
    name: "Avatar",
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

export function DashboardSidebar() {
  const pathname = usePathname()

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
          <Link
            href="/dashboard/billing"
            className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 text-sm font-medium text-sidebar-foreground transition hover:bg-sidebar-accent"
          >
            <CreditCardIcon className="size-4 text-sidebar-foreground/70" />
            <span>User billing settings</span>
          </Link>
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
            href="/dashboard/billing"
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="User billing settings"
          >
            <CreditCardIcon className="size-4" />
          </Link>
          <div
            className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground"
            aria-label="Available credits"
          >
            <BadgeDollarSignIcon className="size-4" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
