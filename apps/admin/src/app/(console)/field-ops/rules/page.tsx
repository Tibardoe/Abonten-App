import { StepUpButton } from "@/components/StepUpButton";
import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadFieldOpsRules } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { ACTIVITY_LABEL } from "@abonten/services/admin/fieldOps/fieldOpsAdminShared";
import type {
  FieldOpsActivityKey,
  FieldOpsCommissionRule,
} from "@abonten/types/fieldOps";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { ActivateRuleButton, NewRuleVersionForm } from "./RuleControls";

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

function terms(r: FieldOpsCommissionRule): string {
  const e = r.eligibility;
  const parts: string[] = [money(r.amountMinor, r.currency)];
  if (typeof e.holding_days === "number")
    parts.push(`${e.holding_days}-day holding`);
  if (e.release_policy === "event_started")
    parts.push("after the event starts");
  if (e.release_policy === "claim_approved")
    parts.push("after the claim is approved");
  if (typeof e.min_photos === "number") parts.push(`≥${e.min_photos} photos`);
  if (typeof e.max_distance_m === "number")
    parts.push(`within ${e.max_distance_m} m`);
  if (e.require_inside_territory) parts.push("inside territory");
  if (e.require_owner_phone_verified) parts.push("owner phone verified");
  return parts.join(" · ");
}

// Rule versions are never edited: a change publishes a new, switched-off
// version, and making one live is a separate, audited step.
export default async function FieldOpsRulesPage() {
  const { ctx, rules } = await loadFieldOpsRules();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const canConfigure = ctx.permissions.includes("fieldops.rules");
  const editable = canConfigure && stepUpFresh;

  const byKey = new Map<FieldOpsActivityKey, FieldOpsCommissionRule[]>();
  for (const r of rules.data ?? []) {
    byKey.set(r.activityKey, [...(byKey.get(r.activityKey) ?? []), r]);
  }

  return (
    <div>
      <PageHeader
        title="Commission rules"
        description="What each activity pays, programme-wide. A campaign can override an activity with its own version from its page. A version that pays more than the live one must be made live by a different admin from the one who published it. Nothing pays until the part of the programme that earns it has shipped."
      />
      <FieldOpsTabs active="/field-ops/rules" />

      {canConfigure && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Changing rules needs a fresh identity check.
          <StepUpButton next="/field-ops/rules" />
        </Card>
      ) : null}

      {rules.status !== 200 ? (
        <EmptyState>{rules.message ?? "Couldn't load the rules."}</EmptyState>
      ) : (
        <div className="space-y-4">
          {[...byKey.entries()].map(([key, versions]) => {
            const live = versions.find((v) => v.isActive) ?? null;
            return (
              <Card key={key} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{ACTIVITY_LABEL[key]}</p>
                    <p className="text-xs text-muted-foreground">
                      {live
                        ? `Live: v${live.version}`
                        : "Switched off — no version is live."}
                    </p>
                  </div>
                  {live ? (
                    <ActivateRuleButton
                      activityKey={key}
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
                        <div className="text-xs text-muted-foreground">
                          {v.note ? `${v.note} · ` : ""}
                          {v.createdByName
                            ? `published by ${v.createdByName}`
                            : "launch default"}{" "}
                          · {timeAgo(v.createdAt)}
                        </div>
                      </div>
                      {!v.isActive ? (
                        <ActivateRuleButton
                          activityKey={key}
                          ruleId={v.id}
                          label="Make live"
                          editable={editable}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                <NewRuleVersionForm latest={versions[0]} editable={editable} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
