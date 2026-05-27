"use client"

import { usePathname } from "next/navigation"

import { dashboardNavigationItems } from "@/components/dashboard/dashboard-sidebar"

function getDashboardPageTitle(pathname: string) {
  if (pathname === "/dashboard/profile") {
    return "Profile Settings"
  }

  const currentItem = dashboardNavigationItems.find((item) => {
    if (item.href === "/dashboard") {
      return pathname === item.href
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  })

  return currentItem?.name ?? "Dashboard"
}

export function DashboardPageTitle() {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
      <h1 className="truncate text-xl font-semibold tracking-tight">
        {getDashboardPageTitle(usePathname())}
      </h1>
    </div>
  )
}
