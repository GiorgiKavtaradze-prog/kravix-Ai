"use client"

import {
  CoinsIcon,
  CreditCardIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  UserRoundIcon,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type CreditBalance,
  type CreditPurchasePlan,
  type CreditTransaction,
} from "@/lib/credits"
import { getInsforgeAuthHeaders } from "@/lib/insforge/client-auth-headers"
import {
  getCurrentUserProfile,
  syncCurrentUserProfile,
} from "@/lib/insforge/sync-user-profile"
import type { UserProfile } from "@/lib/users"

type CreditsResponse = {
  credits: CreditBalance
  transactions: CreditTransaction[]
  plans: CreditPurchasePlan[]
  error?: string
}

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

function formatAmount(amount: number) {
  return amount > 0 ? `+${amount.toLocaleString()}` : amount.toLocaleString()
}

export function ProfileSettingsClient() {
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [credits, setCredits] = React.useState<CreditBalance | null>(null)
  const [transactions, setTransactions] = React.useState<CreditTransaction[]>([])
  const [plans, setPlans] = React.useState<CreditPurchasePlan[]>([])
  const [name, setName] = React.useState("")
  const [avatarUrl, setAvatarUrl] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [savingProfile, setSavingProfile] = React.useState(false)
  const [purchasingPlanId, setPurchasingPlanId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function loadProfile(sync = false, showLoading = true) {
    if (showLoading) setLoading(true)
    setError(null)

    try {
      const [userProfile, creditResponse] = await Promise.all([
        sync ? syncCurrentUserProfile() : getCurrentUserProfile(),
        loadCredits(),
      ])

      setProfile(userProfile)
      setName(userProfile?.name ?? "")
      setAvatarUrl(userProfile?.avatar_url ?? "")
      setCredits(creditResponse.credits)
      setTransactions(creditResponse.transactions)
      setPlans(creditResponse.plans)
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Unable to load settings."
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadCredits() {
    const headers = await getInsforgeAuthHeaders()
    const response = await fetch("/api/credits", { headers })
    const data = (await response.json()) as CreditsResponse

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load credits.")
    }

    return data
  }

  async function saveProfile() {
    setSavingProfile(true)
    setError(null)

    try {
      const headers = await getInsforgeAuthHeaders()
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          avatar_url: avatarUrl,
        }),
      })
      const data = (await response.json()) as { user?: UserProfile; error?: string }

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "Unable to save profile.")
      }

      setProfile(data.user)
      toast.success("Profile updated")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save profile.")
    } finally {
      setSavingProfile(false)
    }
  }

  async function purchaseCredits(planId: string) {
    setPurchasingPlanId(planId)
    setError(null)

    try {
      const headers = await getInsforgeAuthHeaders()
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId }),
      })
      const data = (await response.json()) as { url?: string; error?: string }

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout.")
      }

      window.location.assign(data.url)
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Unable to start checkout."
      )
      setPurchasingPlanId(null)
    }
  }

  React.useEffect(() => {
    void loadProfile(false, true)
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    if (params.get("checkout") === "success") {
      toast.success("Payment received. Credits will appear after Stripe confirms it.")
      window.setTimeout(() => void loadProfile(false, false), 0)
    } else if (params.get("checkout") === "cancelled") {
      toast.info("Checkout cancelled")
    }
  }, [])

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-3">
            Settings
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Profile and credits
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage your account details, credit balance, usage history, and purchases.
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

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Loading settings
        </div>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[20rem_1fr]">
            <div className="rounded-lg border border-border bg-card p-5">
              <Avatar className="size-20" size="lg">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || "User"} /> : null}
                <AvatarFallback className="text-xl">{getInitials(profile)}</AvatarFallback>
              </Avatar>
              <h3 className="mt-4 text-lg font-semibold">
                {profile?.name ?? "Unnamed user"}
              </h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {profile?.email ?? "No email saved"}
              </p>
              <div className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Email</span>
                  <Badge variant={profile?.email_verified ? "default" : "secondary"}>
                    {profile?.email_verified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Providers</span>
                  <span className="truncate font-medium">
                    {profile?.providers.length ? profile.providers.join(", ") : "Password"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Last seen</span>
                  <span className="text-right font-medium">
                    {formatDate(profile?.last_seen_at ?? null)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-5 flex items-center gap-3">
                <UserRoundIcon className="size-5 text-primary" />
                <h3 className="text-lg font-semibold">Profile settings</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your display name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" value={profile?.email ?? ""} disabled />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="profile-avatar">Profile image URL</Label>
                  <Input
                    id="profile-avatar"
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    placeholder="https://example.com/avatar.png"
                  />
                </div>
                <div className="space-y-2">
                  <Label>User ID</Label>
                  <Input value={profile?.id ?? ""} disabled className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Account created</Label>
                  <Input value={formatDate(profile?.created_at ?? null)} disabled />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => void saveProfile()} disabled={savingProfile}>
                  {savingProfile ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                  Save profile
                </Button>
              </div>
            </div>
          </section>

          <section id="credits" className="grid scroll-mt-24 gap-5 lg:grid-cols-[1fr_24rem]">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <CoinsIcon className="size-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Credit management</h3>
                    <p className="text-sm text-muted-foreground">
                      Current balance and recent usage across generation tools.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3 text-right">
                  <p className="text-xs text-muted-foreground">Available credits</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {(credits?.balance ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                  <HistoryIcon className="size-4 text-muted-foreground" />
                  <h4 className="font-medium">Recent credit history</h4>
                </div>
                {transactions.length ? (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(transaction.created_at)}
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit capitalize">
                          {transaction.type}
                        </Badge>
                        <span className="font-semibold tabular-nums">
                          {formatAmount(transaction.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No credit activity yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <CreditCardIcon className="size-5 text-primary" />
                <h3 className="text-lg font-semibold">Purchase credits</h3>
              </div>
              <div className="grid gap-3">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{plan.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {plan.credits.toLocaleString()} credits
                        </p>
                      </div>
                      <p className="text-lg font-semibold">${plan.price.toFixed(2)}</p>
                    </div>
                    <Button
                      className="mt-4 w-full"
                      onClick={() => void purchaseCredits(plan.id)}
                      disabled={Boolean(purchasingPlanId)}
                    >
                      {purchasingPlanId === plan.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <CreditCardIcon />
                      )}
                      Buy credits
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
