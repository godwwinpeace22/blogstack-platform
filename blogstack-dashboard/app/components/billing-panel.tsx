import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@blogstack/ui";
import {
  PLANS as CATALOG,
  type Plan,
  type BillingInterval,
} from "@blogstack/sdk";
import { useActiveAccount } from "../lib/account-context";
import { api } from "../lib/api";
import { ErrorMessage, Panel } from "./feedback";
// Internal workspace metadata is private to the hosted dashboard. Public SDK
// subscription types continue to describe customer billing states.
type DashboardBilling = Omit<
  Awaited<ReturnType<typeof api.billing.get>>,
  "status"
> & { status: string; internalAccess?: boolean };
export function BillingPanel() {
  const { activeId, accounts } = useActiveAccount(),
    qc = useQueryClient();
  const owner = accounts.find((a) => a.id === activeId)?.role === "owner";
  const [interval, setInterval] = React.useState<BillingInterval>(() =>
    new URLSearchParams(window.location.search).get("interval") === "year"
      ? "year"
      : "month",
  );
  const [pollUntil, setPollUntil] = React.useState(() =>
    new URLSearchParams(window.location.search).has("checkout")
      ? Date.now() + 45000
      : 0,
  );
  const billing = useQuery({
    queryKey: api.queryKey(["billing", activeId]),
    queryFn: async () => (await api.billing.get(activeId)) as DashboardBilling,
    enabled: owner,
    refetchInterval: () => (Date.now() < pollUntil ? 3000 : false),
  });
  const action = useMutation({
    mutationFn: async (input: {
      kind: "checkout" | "change" | "portal" | "sync";
      plan?: Plan;
    }) => {
      if (input.kind === "portal") {
        const result = await api.billing.portal(activeId);
        window.location.assign(result.url);
        return;
      }
      if (input.kind === "sync") {
        await api.billing.sync(activeId);
        return;
      }
      if (!input.plan) return;
      if (input.kind === "checkout") {
        const result = await api.billing.checkout(
          activeId,
          input.plan,
          interval,
        );
        window.location.assign(result.url);
      } else await api.billing.change(activeId, input.plan, interval);
    },
    onSuccess: (_, input) => {
      if (input.kind === "change" || input.kind === "sync")
        setPollUntil(Date.now() + 45000);
      void qc.invalidateQueries({ queryKey: api.queryKey([]) });
    },
  });
  const synced = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (
      owner &&
      billing.data?.configured &&
      new URLSearchParams(window.location.search).get("checkout") ===
        "complete" &&
      synced.current !== activeId
    ) {
      synced.current = activeId;
      action.mutate({ kind: "sync" });
    }
  }, [activeId, owner, billing.data?.configured, action.mutate]);
  if (!owner)
    return (
      <Panel title="Subscription">
        <p className="text-sm text-muted-foreground">
          Your workspace owner manages the subscription and shared allowances.
        </p>
      </Panel>
    );
  const data = billing.data;
  const date = (value: number | null) =>
    value ? new Date(value * 1000).toLocaleDateString() : "—";
  return (
    <div className="space-y-6">
      <ErrorMessage error={billing.error || action.error} />
      {billing.isLoading ? <p role="status">Loading subscription…</p> : null}
      {data ? (
        <>
          <Panel
            title={
              data.internalAccess
                ? "Internal demo workspace"
                : "Your subscription"
            }
          >
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="font-medium">
                  {CATALOG[data.plan].name} · {data.status.replace("_", " ")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.internalAccess
                    ? "No expiry. This internal workspace is not billed. Plan allowances still apply."
                    : data.paidThrough
                      ? "Paid access until " + date(data.paidThrough)
                      : data.trialEndsAt
                        ? "Trial ends " + date(data.trialEndsAt)
                        : "Your 14-day Studio trial starts when you create your first blog."}
                </p>
                {data.cancelAtPeriodEnd ? (
                  <p className="mt-2 text-sm">
                    Cancellation is scheduled. Access continues until the paid
                    period ends.
                  </p>
                ) : null}
                {data.pendingPlan ? (
                  <p role="status" className="mt-2 text-sm">
                    Pending change to {CATALOG[data.pendingPlan].name}. Access
                    updates after payment or at renewal.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.hasBillingCustomer ? (
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "portal" })}
                  >
                    Payments & cancellation
                  </Button>
                ) : null}
                {data.configured ? (
                  <Button
                    variant="ghost"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "sync" })}
                  >
                    Refresh payment status
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  "Blogs",
                  data.usage.blogs +
                    " / " +
                    (data.limits.maxProjects ?? "unlimited"),
                ],
                [
                  "People",
                  data.usage.people + " / " + data.limits.maxAccountMembers,
                ],
                [
                  "Storage",
                  (data.usage.storageBytes / 1e9).toFixed(2) +
                    " / " +
                    data.limits.storageBytes / 1e9 +
                    " GB",
                ],
                ["AI credits", data.usage.ai + " / " + data.limits.aiCredits],
                [
                  "Link checks",
                  data.usage.links + " / " + data.limits.linkChecks,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {!data.canWrite && data.deletesAt ? (
              <p className="text-sm">
                Public delivery grace ends {date(data.deliveryEndsAt)}. Export
                content before deletion on {date(data.deletesAt)}.
              </p>
            ) : null}
          </Panel>
          {!data.internalAccess ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Choose your plan</h2>
                <div className="flex rounded-lg border p-1">
                  {(["month", "year"] as const).map((value) => (
                    <button
                      key={value}
                      className={
                        "rounded-md px-4 py-2 text-sm " +
                        (interval === value
                          ? "bg-primary text-primary-foreground"
                          : "")
                      }
                      onClick={() => setInterval(value)}
                    >
                      {value === "month" ? "Monthly" : "Annual · save 2 months"}
                    </button>
                  ))}
                </div>
              </div>
              {!data.configured ? (
                <p role="status" className="rounded border p-3 text-sm">
                  Purchases are not available yet. Your trial and content are
                  unchanged.
                </p>
              ) : null}
              <div className="grid gap-5 xl:grid-cols-3">
                {(
                  Object.entries(CATALOG) as [Plan, (typeof CATALOG)[Plan]][]
                ).map(([id, plan]) => (
                  <Panel key={id} title={plan.name}>
                    <p className="text-3xl font-semibold">
                      {"$" +
                        (interval === "month" ? plan.monthly : plan.annual)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{interval === "month" ? "month" : "year"}
                      </span>
                    </p>
                    <ul className="space-y-2 text-sm">
                      <li>
                        {plan.maxProjects ?? "Unlimited"}{" "}
                        {plan.maxProjects === 1 ? "blog" : "blogs"}
                      </li>
                      <li>
                        {plan.maxAccountMembers} people ·{" "}
                        {plan.storageBytes / 1e9} GB shared storage
                      </li>
                      <li>SEO checks and link analytics</li>
                      <li>{plan.analyticsDays}-day analytics history</li>
                      <li>{plan.aiCredits} AI credits/month</li>
                      <li>
                        {plan.linkChecks.toLocaleString()} link checks/month
                      </li>
                      <li>
                        {plan.customBranding
                          ? "Agency branding and attribution removal"
                          : "BlogStack client workspace"}
                      </li>
                    </ul>
                    <Button
                      className="w-full"
                      disabled={
                        !data.configured ||
                        action.isPending ||
                        (data.plan === id &&
                          data.interval === interval &&
                          data.status === "active")
                      }
                      onClick={() =>
                        action.mutate({
                          kind: data.hasSubscription ? "change" : "checkout",
                          plan: id,
                        })
                      }
                    >
                      {data.plan === id &&
                      data.interval === interval &&
                      data.status === "active"
                        ? "Current plan"
                        : data.hasSubscription
                          ? "Change plan"
                          : "Subscribe"}
                    </Button>
                  </Panel>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Prices are in USD; applicable taxes are calculated at checkout.
                Upgrades charge a prorated difference after confirmation.
                Downgrades and billing-interval changes take effect at renewal.
                Monthly allowances reset monthly on annual plans too. There are
                no automatic overage charges.
              </p>
              <p className="text-xs text-muted-foreground">
                Each blog supports 1,000 posts and images up to 10 MiB. One AI
                credit covers up to 4,000 input tokens and 1,000 output tokens
                across a request. Unused reservations are returned; larger
                requests can use multiple credits.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
