import type { ReactNode } from "react"

import { DashboardPageTitle } from "@/components/dashboard/dashboard-page-title"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset className="min-h-svh overflow-hidden bg-[radial-gradient(circle_at_top_left,var(--color-secondary),transparent_34rem),var(--color-background)]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <SidebarTrigger className="md:hidden" />
          <DashboardPageTitle />
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
