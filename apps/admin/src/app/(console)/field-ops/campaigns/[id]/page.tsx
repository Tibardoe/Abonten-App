import { StepUpButton } from "@/components/StepUpButton";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsCampaign } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/fieldOps/campaignLifecycle";
import { ACTIVITY_LABEL } from "@abonten/services/admin/fieldOps/fieldOpsAdminShared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldOpsTabs } from "../../FieldOpsTabs";
import { campaignStatusTone } from "../../page";
import { CampaignForm } from "../CampaignForm";
import { CampaignStatusControls } from "./CampaignStatusControls";
import { AddMemberForm, MemberRowActions } from "./TeamControls";

const ROLE_LABEL: Record<string, string> = {
  team_lead: "Team lead",
  content_creator: "Content creator",
  offline_member: "Offline member",
  online_member: "Online member",
};

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

export default async function FieldOpsCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail, members } = await loadFieldOpsCampaign(id);
  if (detail.status === 404) notFound();
  const canManage = ctx.permissions.includes("fieldops.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const editable = canManage && stepUpFresh;

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <FieldOpsTabs active="/field-ops/campaigns" />
        <EmptyState>
          {detail.message ?? "Couldn't load the campaign."}
        </EmptyState>
      </div>
    );
  }
  const { campaign, territories, rules } = detail.data;
  const team = members.status === 200 ? (members.data ?? []) : [];
  const activeLead = team.find(
    (m) => m.role === "team_lead" && m.status === "active",
  );

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={
          <>
            {campaign.regionName} · {campaign.currency} · created{" "}
            {timeAgo(campaign.createdAt)}
          </>
        }
        actions={
          <Badge tone={campaignStatusTone(campaign.status)}>
            {CAMPAIGN_STATUS_LABEL[campaign.status]}
          </Badge>
        }
      />
      <FieldOpsTabs active="/field-ops/campaigns" />

      {canManage && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Changing this campaign needs a fresh identity check.
          <StepUpButton next={`/field-ops/campaigns/${campaign.id}`} />
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active members" value={campaign.activeMemberCount} />
        <Stat
          label="Team lead"
          value={activeLead?.fullName ?? "—"}
          tone={activeLead ? undefined : "warning"}
          hint={activeLead ? undefined : "needed before activation"}
        />
        <Stat
          label="Territories in region"
          value={territories.length}
          href={`/field-ops/regions/${campaign.regionId}`}
          tone={territories.length > 0 ? undefined : "warning"}
        />
        <Stat
          label="Budget cap"
          value={
            campaign.budgetCapMinor === null
              ? "none"
              : money(campaign.budgetCapMinor, campaign.currency)
          }
        />
      </div>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
        Status
      </h3>
      <CampaignStatusControls
        campaignId={campaign.id}
        status={campaign.status}
        editable={editable}
      />

      <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
        Team
      </h3>
      {team.length === 0 ? (
        <EmptyState>No members yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Phone verified</Th>
              <Th>Payout</Th>
              <Th>Joined</Th>
              {editable ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id}>
                <Td>
                  {m.userId ? (
                    <Link
                      href={`/users/${m.userId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {m.fullName ?? m.username ?? m.userId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {m.fullName ?? "Invited"}
                    </span>
                  )}
                  {m.invitedPhoneMasked ? (
                    <div className="text-xs text-muted-foreground">
                      invited {m.invitedPhoneMasked}
                    </div>
                  ) : null}
                </Td>
                <Td>{ROLE_LABEL[m.role] ?? m.role}</Td>
                <Td>
                  <Badge
                    tone={
                      m.status === "active"
                        ? "success"
                        : m.status === "suspended"
                          ? "danger"
                          : m.status === "invited"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {m.status}
                  </Badge>
                  {m.suspendedReason ? (
                    <div className="text-xs text-muted-foreground">
                      {m.suspendedReason}
                    </div>
                  ) : null}
                </Td>
                <Td className="text-muted-foreground">
                  {m.phoneVerified === null
                    ? "—"
                    : m.phoneVerified
                      ? "yes"
                      : "no"}
                </Td>
                <Td className="text-muted-foreground">
                  {m.payoutDestinationMasked ?? "not set"}
                </Td>
                <Td className="text-muted-foreground">{timeAgo(m.joinedAt)}</Td>
                {editable ? (
                  <Td className="w-64">
                    <MemberRowActions
                      memberId={m.id}
                      status={m.status}
                      role={m.role}
                    />
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editable && campaign.status !== "archived" ? (
        <div className="mt-3">
          <AddMemberForm campaignId={campaign.id} />
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
        Commission rules in force
      </h3>
      {rules.length === 0 ? (
        <EmptyState>
          No live rule applies to this campaign yet. Make one live under{" "}
          <Link
            href="/field-ops/rules"
            className="text-primary hover:underline"
          >
            Commission rules
          </Link>
          .
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Activity</Th>
              <Th>Pays</Th>
              <Th>Scope</Th>
              <Th>Version</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>{ACTIVITY_LABEL[r.activityKey]}</Td>
                <Td className="tabular-nums">
                  {money(r.amountMinor, r.currency)}
                </Td>
                <Td className="text-muted-foreground">
                  {r.campaignId ? "this campaign" : "programme default"}
                </Td>
                <Td className="tabular-nums">v{r.version}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
        Details
      </h3>
      {editable && campaign.status !== "archived" ? (
        <CampaignForm
          regions={[
            {
              id: campaign.regionId,
              name: campaign.regionName,
              liveCampaignId: null,
            },
          ]}
          campaign={campaign}
        />
      ) : (
        <Card className="p-4 text-sm">
          <p>{campaign.description ?? "No description."}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {campaign.startsOn ?? "no start date"} → {campaign.endsOn ?? "open"}{" "}
            · holding period{" "}
            {campaign.holdingDaysOverride === null
              ? "programme default"
              : `${campaign.holdingDaysOverride} days`}
          </p>
        </Card>
      )}
    </div>
  );
}
