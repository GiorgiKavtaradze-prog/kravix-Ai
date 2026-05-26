import Link from "next/link"
import { Suspense } from "react"

import { AuthShell } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { Skeleton } from "@/components/ui/skeleton"

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your studio"
      description="Access your AI operations dashboard, workflows, and team spaces."
      footer={
        <>
          New to Kravix?{" "}
          <Link href="/sign-up" className="font-medium text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  )
}
