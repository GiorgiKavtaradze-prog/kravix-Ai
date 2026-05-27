"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { useForm } from "react-hook-form"

import { GoogleOAuthButton } from "@/components/auth/oauth-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  signUpSchema,
  type SignUpValues,
  type VerificationValues,
  verificationSchema,
} from "@/lib/auth/validation"
import { insforge } from "@/lib/insforge/client"

export function SignUpForm() {
  const router = useRouter()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [verificationEmail, setVerificationEmail] = React.useState<string | null>(
    null
  )
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })
  const {
    register: registerVerification,
    handleSubmit: handleVerificationSubmit,
    formState: { errors: verificationErrors, isSubmitting: isVerifying },
  } = useForm<VerificationValues>({
    resolver: zodResolver(verificationSchema),
    defaultValues: {
      otp: "",
    },
  })

  async function onSubmit(values: SignUpValues) {
    setFormError(null)
    const { data, error } = await insforge.auth.signUp({
      name: values.name,
      email: values.email,
      password: values.password,
      redirectTo: `${window.location.origin}/sign-in`,
    })

    if (error || !data) {
      setFormError(error?.message ?? "Unable to create your account.")
      return
    }

    if (data.requireEmailVerification) {
      setVerificationEmail(values.email)
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  async function onVerify(values: VerificationValues) {
    if (!verificationEmail) return

    setFormError(null)
    const { data, error } = await insforge.auth.verifyEmail({
      email: verificationEmail,
      otp: values.otp,
    })

    if (error || !data) {
      setFormError(error?.message ?? "Unable to verify this code.")
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/85 p-5 shadow-xl shadow-primary/5 backdrop-blur sm:p-6">
      {formError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircleIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {verificationEmail ? (
        <form
          className="space-y-5"
          onSubmit={handleVerificationSubmit(onVerify)}
        >
          <Alert className="border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2Icon />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription className="text-primary/80">
              Enter the 6-digit code sent to {verificationEmail}.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              aria-invalid={Boolean(verificationErrors.otp)}
              className="h-12 rounded-xl bg-background/70 text-center text-lg tracking-[0.5em]"
              {...registerVerification("otp")}
            />
            {verificationErrors.otp ? (
              <p className="text-sm text-destructive">
                {verificationErrors.otp.message}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-11 w-full rounded-xl shadow-lg shadow-primary/20"
            disabled={isVerifying}
          >
            {isVerifying ? <Loader2Icon className="animate-spin" /> : null}
            Verify and continue
          </Button>
        </form>
      ) : (
        <>
          <GoogleOAuthButton label="Sign up with Google" />
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Rahul Sanap"
                aria-invalid={Boolean(errors.name)}
                className="h-11 rounded-xl bg-background/70"
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>
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
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="6+ characters"
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  className="h-11 rounded-xl bg-background/70"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword ? (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full rounded-xl shadow-lg shadow-primary/20"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
              Create account
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
