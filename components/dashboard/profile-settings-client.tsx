"use client"

import { Loader2Icon, RefreshCwIcon, UserRoundIcon } from "lucide-react"
import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getCurrentUserProfile,
  syncCurrentUserProfile,
} from "@/lib/insforge/sync-user-profile"
import type { UserProfile } from "@/lib/users"

function getInitials(profile: UserProfile | null) {
  const value = profile?.name ?? profile?.email ?? "User"
  const parts = value.split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return value.slice(0, 2).toUpperCase()
}

function formatDate(value: string | null) {
  if (!value) return "Not available"

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function ProfileSettingsClient() {
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  async function loadProfile(sync = false, showLoading = true) {
    if (showLoading) {
      setLoading(true)
    }
    setError(null)

    try {
      const userProfile = sync
        ? await syncCurrentUserProfile()
        : await getCurrentUserProfile()

      setProfile(userProfile)
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Unable to load profile."
      )
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile(false, false)
  }, [])

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-3">
            Account
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Profile settings
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your dashboard profile is saved from your sign-in identity.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadProfile(true)}>
          <RefreshCwIcon />
          Sync profile
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-muted-foreground">
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Loading profile
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-background p-6 text-center">
              <Avatar className="size-20" size="lg">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.name ?? "User"}
                  />
                ) : null}
                <AvatarFallback className="text-xl">
                  {getInitials(profile)}
                </AvatarFallback>
              </Avatar>
              <h3 className="mt-4 text-lg font-semibold">
                {profile?.name ?? "Unnamed user"}
              </h3>
              <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
                {profile?.email ?? "No email saved"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Email status
                </p>
                <p className="mt-2 font-medium">
                  {profile?.email_verified ? "Verified" : "Not verified"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Providers
                </p>
                <p className="mt-2 font-medium">
                  {profile?.providers.length
                    ? profile.providers.join(", ")
                    : "Password or unknown"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Last seen
                </p>
                <p className="mt-2 font-medium">
                  {formatDate(profile?.last_seen_at ?? null)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  User ID
                </p>
                <p className="mt-2 truncate font-mono text-sm">
                  {profile?.id ?? "Not available"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <UserRoundIcon className="mb-3 size-5 text-primary" />
        Profile fields are synchronized from InsForge Auth whenever you sign in
        or sign up. Use Sync profile to refresh this saved database record.
      </div>
    </section>
  )
}
