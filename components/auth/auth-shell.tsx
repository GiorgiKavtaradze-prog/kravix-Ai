import Link from "next/link"
import type { ReactNode } from "react"

import { ThemeToggle } from "@/components/theme-toggle"

export function AuthShell({
  children,
  eyebrow,
  title,
  description,
  footer,
}: {
  children: ReactNode
  eyebrow: string
  title: string
  description: string
  footer: ReactNode
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_oklab,var(--secondary)_65%,transparent),transparent_38%)]" />
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden min-h-screen flex-col justify-between border-r border-border/70 px-10 py-8 lg:flex">
          <Link href="/" className="flex w-fit items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
              AI
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Kravix AI Studio
            </span>
          </Link>
          <div className="max-w-xl">
            <p className="mb-5 text-sm font-medium uppercase tracking-[0.24em] text-primary">
              {eyebrow}
            </p>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight">
              Build, ship, and monitor premium AI workflows.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              A focused studio for teams turning prompts, data, and models into
              production-ready automation.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["Realtime runs", "Team spaces", "Model routing"].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-border/70 bg-card/70 p-4 text-sm font-medium shadow-sm backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:px-14">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">
                AI
              </span>
              <span className="font-semibold tracking-tight">
                Kravix AI Studio
              </span>
            </Link>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-md">
              <div className="mb-8">
                <p className="mb-3 text-sm font-medium text-primary">
                  {eyebrow}
                </p>
                <h2 className="text-3xl font-semibold tracking-tight">
                  {title}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {description}
                </p>
              </div>
              {children}
              <div className="mt-8 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
