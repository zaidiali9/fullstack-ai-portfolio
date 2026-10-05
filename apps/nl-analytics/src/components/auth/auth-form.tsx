"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Separator } from "@portfolio/ui/separator";
import { Spinner } from "@portfolio/ui/spinner";
import { signIn, signUp } from "@/lib/auth-client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoRole } from "@/lib/demo";

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/ask";
}

export function AuthForm({ mode, githubEnabled }: { mode: "sign-in" | "sign-up"; githubEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const demo = params.get("demo") as DemoRole | null;
  const demoAccount = demo && demo in DEMO_ACCOUNTS ? DEMO_ACCOUNTS[demo] : null;
  const rawNext = params.get("next");
  const next = safeNext(rawNext);
  const nextQuery = rawNext ? `?next=${encodeURIComponent(next)}` : "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setPending(true);
    const res =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(fd.get("name") ?? "").trim() || email.split("@")[0]! });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts. Please wait a minute and try again." : (res.error.message ?? "Something went wrong."));
      return;
    }
    toast.success(mode === "sign-in" ? "Welcome back" : "Account created");
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "sign-in" ? "Welcome back to Tally." : "Book appointments and manage them in one place."}
      </p>

      {mode === "sign-in" ? (
        <div className="mt-6 rounded-lg border border-dashed bg-muted/50 p-3 text-sm">
          <p className="font-medium">Demo accounts (seed data)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(DEMO_ACCOUNTS) as DemoRole[]).map((r) => (
              <Button key={r} variant={demo === r ? "default" : "outline"} size="sm" asChild>
                <Link href={`/sign-in?demo=${r}${rawNext ? `&next=${encodeURIComponent(next)}` : ""}`} replace>
                  {DEMO_ACCOUNTS[r].label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" key={demo ?? "none"}>
        {mode === "sign-up" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" required maxLength={80} />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={demoAccount?.email} aria-describedby={error ? "auth-error" : undefined} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={8}
            maxLength={128}
            defaultValue={demoAccount ? DEMO_PASSWORD : undefined}
            aria-describedby={mode === "sign-up" ? "password-hint" : undefined}
          />
          {mode === "sign-up" ? (
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          ) : null}
        </div>
        {error ? (
          <p id="auth-error" role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-9 w-full" disabled={pending}>
          {pending ? <Spinner /> : null}
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {githubEnabled ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
          <Button variant="outline" className="h-9 w-full" onClick={() => signIn.social({ provider: "github", callbackURL: next })}>
            Continue with GitHub
          </Button>
        </>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? "New here? " : "Already have an account? "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={mode === "sign-in" ? `/sign-up${nextQuery}` : `/sign-in${nextQuery}`}
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
