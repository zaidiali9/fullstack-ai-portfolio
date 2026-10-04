import { Check, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@portfolio/ui/alert";
import { Badge } from "@portfolio/ui/badge";
import { ActionButton } from "@/components/confirm-action-button";
import { env } from "@/lib/env";
import { checkoutAction, portalAction } from "@/server/actions/billing";
import { requireOrgPage } from "@/server/authz";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params, searchParams }: PageProps<"/o/[org]/settings/billing">) {
  const { org } = await params;
  const { checkout } = await searchParams;
  const ctx = await requireOrgPage(org, "billing:manage");
  const configured = billingConfigured();
  const isPro = ctx.org.plan === "pro";
  const plans = [
    { id: "free", name: "Free", features: [`${env().AI_DAILY_LIMIT_FREE} AI calls per day`, "Unlimited agents and tickets", "AI triage, drafts and summaries"] },
    { id: "pro", name: "Pro", features: [`${env().AI_DAILY_LIMIT_PRO} AI calls per day`, "Everything in Free", "Billing portal and invoices via Stripe"] },
  ];
  return (
    <div className="max-w-3xl space-y-6">
      {checkout === "success" ? (
        <Alert>
          <Check className="size-4" aria-hidden />
          <AlertTitle>Checkout complete</AlertTitle>
          <AlertDescription>Your plan updates as soon as Stripe sends the confirmation webhook.</AlertDescription>
        </Alert>
      ) : null}
      {!configured ? (
        <Alert>
          <CreditCard className="size-4" aria-hidden />
          <AlertTitle>Payments not configured</AlertTitle>
          <AlertDescription>
            This server has no Stripe test-mode keys, so upgrading is disabled. Set STRIPE_SECRET_KEY, STRIPE_PRICE_PRO and
            STRIPE_WEBHOOK_SECRET (test mode) to enable checkout.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => {
          const current = ctx.org.plan === p.id;
          return (
            <section key={p.id} className={`rounded-xl border bg-card p-5 ${current ? "ring-2 ring-primary" : ""}`} aria-labelledby={`plan-${p.id}`}>
              <div className="flex items-center justify-between">
                <h2 id={`plan-${p.id}`} className="text-lg font-semibold">
                  {p.name}
                </h2>
                {current ? <Badge>Current plan</Badge> : null}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 text-primary" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {p.id === "pro" && !isPro ? (
                  <ActionButton disabled={!configured} action={checkoutAction.bind(null, org)}>
                    Upgrade with Stripe (test mode)
                  </ActionButton>
                ) : null}
                {p.id === "pro" && isPro && ctx.org.stripeCustomerId ? (
                  <ActionButton variant="outline" disabled={!configured} action={portalAction.bind(null, org)}>
                    Manage subscription
                  </ActionButton>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {ctx.org.subscriptionStatus ? (
        <p className="text-sm text-muted-foreground">
          Subscription status: <span className="font-medium text-foreground">{ctx.org.subscriptionStatus}</span>
          {ctx.org.currentPeriodEnd ? ` · renews ${ctx.org.currentPeriodEnd.toLocaleDateString("en-US")}` : null}
        </p>
      ) : null}
    </div>
  );
}
