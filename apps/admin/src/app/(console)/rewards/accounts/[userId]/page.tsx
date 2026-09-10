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
import { loadCreditAccountDetail } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import {
  formatCredit,
  formatCreditDelta,
} from "@abonten/core/rewards/creditAmount";
import Link from "next/link";
import { AdjustmentDecision } from "../../AdjustmentDecision";
import { RewardsTabs } from "../../RewardsTabs";
import { AdjustmentPanel, FreezePanel, GoodwillPanel } from "./AccountActions";

const LOT_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  pending: "warning",
  exhausted: "neutral",
  expired: "neutral",
  voided: "danger",
  clawed_back: "danger",
  forfeited: "neutral",
};

export default async function CreditAccountDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { ctx, detail } = await loadCreditAccountDetail(userId);

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <PageHeader title="Credit account" />
        <RewardsTabs active="/rewards/accounts" />
        <EmptyState>
          {detail.message ?? "Couldn't load this credit account."}
        </EmptyState>
      </div>
    );
  }

  const d = detail.data;
  const a = d.account;
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const name = d.user.fullName || d.user.username || `${userId.slice(0, 8)}…`;

  return (
    <div>
      <PageHeader
        title={name}
        description={
          <>
            {d.user.username ? `@${d.user.username} · ` : ""}
            <Link
              href={`/users/${userId}`}
              className="text-primary hover:underline"
            >
              User profile
            </Link>
          </>
        }
        actions={
          <Badge
            tone={
              a.status === "frozen"
                ? "warning"
                : a.status === "closed"
                  ? "neutral"
                  : "success"
            }
          >
            Credit account {a.status}
          </Badge>
        }
      />
      <RewardsTabs active="/rewards/accounts" />

      {a.status === "frozen" && a.statusReason ? (
        <Card className="mb-4 border-warning/40 bg-warning/10 p-3 text-sm">
          Frozen {timeAgo(a.statusChangedAt)}: {a.statusReason}
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Available"
          value={formatCredit(a.availableMinor)}
          tone={a.availableMinor < 0 ? "danger" : undefined}
          hint={a.availableMinor < 0 ? "in debt: spending blocked" : undefined}
        />
        <Stat label="Pending" value={formatCredit(a.pendingMinor)} />
        <Stat
          label="On hold"
          value={formatCredit(
            a.reservedMinor + a.frozenMinor + a.withdrawingMinor,
          )}
        />
        <Stat
          label="Earned (lifetime)"
          value={formatCredit(a.lifetimeEarnedMinor)}
          hint={`spent ${formatCredit(a.lifetimeSpentMinor)} · expired ${formatCredit(a.lifetimeExpiredMinor)} · reversed ${formatCredit(a.lifetimeReversedMinor)}`}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <AdjustmentPanel
          userId={userId}
          canAdjust={
            ctx.permissions.includes("finance.adjust") && a.status !== "closed"
          }
          stepUpFresh={stepUpFresh}
          thresholdMinor={d.dualApprovalThresholdMinor}
        />
        <GoodwillPanel
          userId={userId}
          canGrant={
            ctx.permissions.includes("rewards.goodwill") &&
            a.status !== "closed"
          }
          usedMinor={d.goodwillUsedThisMonthMinor}
          capMinor={d.goodwillMonthlyCapMinor}
        />
        <FreezePanel
          userId={userId}
          status={a.status}
          canFreeze={ctx.permissions.includes("rewards.freeze")}
        />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        Credit lots (each grant, what is left of it, and its rules)
      </h3>
      {d.lots.length === 0 ? (
        <EmptyState>No credit has been granted to this user yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Granted</Th>
              <Th>Kind</Th>
              <Th className="text-right">Original</Th>
              <Th className="text-right">Left</Th>
              <Th>Can pay for</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {d.lots.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(l.createdAt)}
                  {l.label ? <div className="text-xs">{l.label}</div> : null}
                </Td>
                <Td>{l.kind}</Td>
                <Td className="text-right tabular-nums">
                  {formatCredit(l.originalMinor)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCredit(l.remainingMinor)}
                  {l.heldMinor > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      {formatCredit(l.heldMinor)} on hold
                    </div>
                  ) : null}
                </Td>
                <Td className="text-muted-foreground">
                  {l.spendScope === "any"
                    ? "Anything"
                    : l.spendScope.replace("_", " ")}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {l.expiresAt
                    ? new Date(l.expiresAt).toLocaleDateString()
                    : "—"}
                </Td>
                <Td>
                  <Badge tone={LOT_TONE[l.status] ?? "neutral"}>
                    {l.status.replace("_", " ")}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        Ledger trace (newest first, every line of every journal)
      </h3>
      {d.journals.length === 0 ? (
        <EmptyState>No ledger entries yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Journal</Th>
              <Th className="text-right">User sees</Th>
              <Th>Lines (debit − / credit +)</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {d.journals.map((j) => (
              <tr key={j.id}>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(j.createdAt)}
                </Td>
                <Td>
                  <div className="font-mono text-xs">{j.journalType}</div>
                  {j.memo ? (
                    <div className="text-xs text-muted-foreground">
                      {j.memo}
                    </div>
                  ) : null}
                  {!j.visibleToUser ? (
                    <div className="text-[11px] text-muted-foreground">
                      hidden from user
                    </div>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCreditDelta(j.userDeltaMinor)}
                </Td>
                <Td>
                  <ul className="space-y-0.5 font-mono text-[11px]">
                    {j.lines.map((line, i) => (
                      <li
                        key={`${j.id}-${i}`}
                        className="flex justify-between gap-4"
                      >
                        <span
                          className={
                            line.isUserAccount ? "" : "text-muted-foreground"
                          }
                        >
                          {line.isUserAccount ? "user:" : "system:"}
                          {line.ledgerCode}
                        </span>
                        <span className="tabular-nums">
                          {formatCreditDelta(line.amountMinor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {j.actorType === "admin"
                    ? (j.actorName ?? "admin")
                    : j.actorType}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        Manual adjustments
      </h3>
      {d.adjustments.length === 0 ? (
        <EmptyState>No manual adjustments for this user.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Requested</Th>
              <Th>Change</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {d.adjustments.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {r.requestedByName ?? "—"} · {timeAgo(r.requestedAt)}
                </Td>
                <Td className="tabular-nums">
                  {r.direction === "credit" ? "+" : "−"}
                  {formatCredit(r.amountMinor)}
                </Td>
                <Td className="max-w-xs text-muted-foreground">
                  {r.reason}
                  {r.decisionNote ? (
                    <div className="text-xs">Decision: {r.decisionNote}</div>
                  ) : null}
                </Td>
                <Td>
                  <Badge
                    tone={
                      r.status === "executed"
                        ? "success"
                        : r.status === "pending"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {r.status}
                  </Badge>
                  {r.decidedByName && r.status !== "pending" ? (
                    <div className="text-xs text-muted-foreground">
                      by {r.decidedByName}
                    </div>
                  ) : null}
                </Td>
                <Td className="w-56">
                  {r.status === "pending" ? (
                    <AdjustmentDecision
                      requestId={r.id}
                      isOwnRequest={r.requestedBy === ctx.userId}
                      canDecide={ctx.permissions.includes("finance.adjust")}
                      stepUpFresh={stepUpFresh}
                    />
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
