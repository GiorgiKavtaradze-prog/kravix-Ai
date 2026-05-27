"use client"

import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

import { insforge } from "@/lib/insforge/client"
import { syncCurrentUserProfile } from "@/lib/insforge/sync-user-profile"

export default function AuthCallbackPage() {
  const router = useRouter()

  React.useEffect(() => {
    async function finishAuth() {
      const { data, error } = await insforge.auth.getCurrentUser()

      if (error || !data.user) {
        const message = encodeURIComponent(
          error?.message ?? "Unable to complete OAuth sign in."
        )
        router.replace(`/sign-in?insforge_error=${message}`)
        return
      }

      try {
        await syncCurrentUserProfile()
      } catch (profileError) {
        const message = encodeURIComponent(
          profileError instanceof Error
            ? profileError.message
            : "Unable to save your profile."
        )
        router.replace(`/sign-in?insforge_error=${message}`)
        return
      }

      router.replace("/dashboard")
    }

    finishAuth()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <Loader2Icon className="mx-auto mb-4 size-6 animate-spin text-primary" />
        <h1 className="text-lg font-semibold">Completing sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Securing your Kravix session.
        </p>
      </div>
    </main>
  )
}
