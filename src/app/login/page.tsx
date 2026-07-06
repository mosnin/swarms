import Link from "next/link";

import { DevLoginForm } from "@/app/login/_components/dev-login-form";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Sign-in screen — adapts to AUTH_MODE (OAuth IdP in prod, email in dev). */
export default function LoginPage() {
  const oauth = env.AUTH_MODE === "oauth";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-rise-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            S
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Swarms</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              An on-demand labor force for your AI agent.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-background/60 p-6 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
          {oauth ? (
            <>
              <a
                href="/api/auth/login"
                className="flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Continue with {env.AUTH_PROVIDER_LABEL}
              </a>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                We only receive your verified email to provision your account.
              </p>
            </>
          ) : (
            <DevLoginForm />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
