"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { useForm } from "react-hook-form"

import { GoogleOAuthButton } from "@/components/auth/oauth-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  signInSchema,
  type SignInValues,
} from "@/lib/auth/validation"
import { insforge } from "@/lib/insforge/client"

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [formError, setFormError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const status = searchParams.get("insforge_status")
  const type = searchParams.get("insforge_type")
  const providerError = searchParams.get("insforge_error")

  async function onSubmit(values: SignInValues) {
    setFormError(null)
    const { data, error } = await insforge.auth.signInWithPassword(values)

    if (error || !data) {
      setFormError(error?.message ?? "Unable to sign in. Check your details.")
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/85 p-5 shadow-xl shadow-primary/5 backdrop-blur sm:p-6">
      <div className="space-y-4">
        {status === "success" && type === "verify_email" ? (
          <Alert className="border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2Icon />
            <AlertTitle>Email verified</AlertTitle>
            <AlertDescription className="text-primary/80">
              Your email is verified. Sign in to continue.
            </AlertDescription>
          </Alert>
        ) : null}
        {providerError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Authentication issue</AlertTitle>
            <AlertDescription>{providerError}</AlertDescription>
          </Alert>
        ) : null}
        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not sign in</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="mt-5">
        <GoogleOAuthButton label="Continue with Google" />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={Boolean(errors.email)}
            className="h-11 rounded-xl bg-background/70"
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            className="h-11 rounded-xl bg-background/70"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl shadow-lg shadow-primary/20"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  )
}
