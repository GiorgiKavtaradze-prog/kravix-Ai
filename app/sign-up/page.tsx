import Link from "next/link"
import { AuthShell } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Start building"
      title="Create your account"
      description="Set up secure access to Kravix."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  )
}
