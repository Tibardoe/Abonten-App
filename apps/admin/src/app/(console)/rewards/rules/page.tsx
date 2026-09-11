import { StepUpButton } from "@/components/StepUpButton";
import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadRewardRules } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { RewardRuleSummary } from "@abonten/types/rewards";
import { RewardsTabs } from "../RewardsTabs";
import { ActivateRuleButton, NewRuleVersionForm } from "./RuleControls";

const RULE_LABELS: Record<string, { title: string; shipped: boolean }> = {
  event_referral: { title: "Event referral", shipped: true },
  friend_referral_referrer: {
    title: "Friend invite (inviter's reward)",
    shipped: true,
  },
  friend_referral_referee: {
    title: "Friend invite (welcome credit)",
    shipped: true,
  },
  organizer_rebate: { title: "Organizer rebate", shipped: true },
  venue_rebate: { title: "Venue rebate", shipped: true },
  organizer_milestone: { title: "Organizer milestone", shipped: true },
  loyalty_fee_rebate: { title: "Loyalty fee rebate", shipped: true },
  promoter_commission: {
    title: "Promoter commission (paid by organizers)",
    shipped: true,
  },
  place_visits: { title: "Place visits", shipped: true },
};

const REBATES = new Set(["organizer_rebate", "venue_rebate"]);

function terms(r: RewardRuleSummary): string {
  const parts: string[] = [];
  const caps = r.caps as Record<string, unknown>;
  if (r.ruleKey === "loyalty_fee_rebate") {
    parts.push(
      `every ${caps.orders_required ?? 5}th order on a different event within ${caps.window_days ?? 90} days: ${(r.rateBps ?? 10000) / 100}% of the cash service fee back`,
    );
    if (typeof caps.max_per_reward_minor === "number")
      parts.push(`max ${formatCredit(caps.max_per_reward_minor)}`);
    if (r.minBasisMinor > 0)
      parts.push(`orders of ${formatCredit(r.minBasisMinor)}+ count`);
    if (r.expiryDays !== null) parts.push(`expires after ${r.expiryDays} days`);
    return parts.join(" · ");
  }
  if (r.ruleKey === "promoter_commission") {
    parts.push(
      `organizers choose ${Number(caps.min_rate_bps ?? 100) / 100}–${Number(caps.max_rate_bps ?? 3000) / 100}% of the ticket price; paid by the organizer, outside the budget`,
    );
    if (r.expiryDays !== null) parts.push(`expires after ${r.expiryDays} days`);
    return parts.join(" · ");
  }
  if (r.ruleKey === "place_visits") {
    parts.push(
      `${formatCredit(r.flatMinor ?? 0)} per different verified visitor a month, max ${caps.max_visitors_per_month ?? 40}, within ${caps.radius_m ?? 150} m`,
    );
    if (r.expiryDays !== null) parts.push(`expires after ${r.expiryDays} days`);
    return parts.join(" · ");
  }
  if (r.rateBps !== null) parts.push(`${r.rateBps / 100}% of ticket revenue`);
  if (r.netShareCapBps !== null)
    parts.push(
      REBATES.has(r.ruleKey)
        ? `${r.netShareCapBps / 100}% of cash net revenue, monthly`
        : `max ${r.netShareCapBps / 100}% of net revenue`,
    );
  if (r.flatMinor !== null) parts.push(formatCredit(r.flatMinor));
  if (r.minBasisMinor > 0)
    parts.push(`min order ${formatCredit(r.minBasisMinor)}`);
  if (r.expiryDays !== null) parts.push(`expires after ${r.expiryDays} days`);
  return parts.join(" · ");
}

// Rule versions are never edited: a change publishes a new, switched-off
// version, and making one live is a separate, audited step.
export default async function RewardRulesPage() {
  const { ctx, rules } = await loadRewardRules();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const canConfigure = ctx.permissions.includes("rewards.configure");
  const editable = canConfigure && stepUpFresh;

  const byKey = new Map<string, RewardRuleSummary[]>();
  for (const r of rules.data ?? []) {
    byKey.set(r.ruleKey, [...(byKey.get(r.ruleKey) ?? []), r]);
  }

  return (
    <div>
      <PageHeader
        title="Reward rules"
        description="What each mechanism pays. A rule does nothing until one version is live. A version that could pay out more than the live one must be made live by a different admin from the one who published it."
      />
      <RewardsTabs active="/rewards/rules" />

      {canConfigure && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Changing rules needs a fresh identity check.
          <StepUpButton next="/rewards/rules" />
        </Card>
      ) : null}

      {rules.status !== 200 ? (
        <EmptyState>{rules.message ?? "Couldn't load the rules."}</EmptyState>
      ) : (
        <div className="space-y-4">
          {[...byKey.entries()].map(([key, versions]) => {
            const label = RULE_LABELS[key] ?? { title: key, shipped: false };
            const live = versions.find((v) => v.isActive) ?? null;
            return (
              <Card key={key} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{label.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {live
                        ? `Live: v${live.version}`
                        : "Switched off — no version is live."}
                      {!label.shipped
                        ? " Not built yet: it pays nothing even when live."
                        : ""}
                    </p>
                  </div>
                  {live && label.shipped ? (
                    <ActivateRuleButton
                      ruleKey={key}
                      ruleId={null}
                      label="Switch off"
                      editable={editable}
                    />
                  ) : null}
                </div>
                <ul className="divide-y divide-border text-sm">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{v.version}</span>
                          {v.isActive ? (
                            <Badge tone="success">live</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {terms(v)}
                        </div>
                        {Object.keys(v.caps).length > 0 ? (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {JSON.stringify(v.caps)}
                          </div>
                        ) : null}
                        <div className="text-xs text-muted-foreground">
                          {v.note ? `${v.note} · ` : ""}
                          {v.createdByName
                            ? `published by ${v.createdByName}`
                            : "launch default"}{" "}
                          · {timeAgo(v.createdAt)}
                        </div>
                      </div>
                      {!v.isActive && label.shipped ? (
                        <ActivateRuleButton
                          ruleKey={key}
                          ruleId={v.id}
                          label="Make live"
                          editable={editable}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {label.shipped ? (
                  <NewRuleVersionForm
                    latest={versions[0]}
                    editable={editable}
                  />
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
