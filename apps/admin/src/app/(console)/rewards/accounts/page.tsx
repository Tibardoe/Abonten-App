import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadCreditAccounts } from "@/lib/data";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditAccountStatus } from "@abonten/types/rewards";
import Link from "next/link";
import { RewardsTabs } from "../RewardsTabs";

const STATUSES: CreditAccountStatus[] = ["active", "frozen", "closed"];

export default async function CreditAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as CreditAccountStatus)
    ? (sp.status as CreditAccountStatus)
    : undefined;
  const res = await loadCreditAccounts({
    search: sp.q || undefined,
    status,
    cursor: sp.cursor ?? null,
  });

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (status) p.set("status", status);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return p.toString();
  };

  return (
    <div>
      <PageHeader
        title="Credit accounts"
        description="Every user with Abonten Credit activity. Open one to see its balances, lots and full ledger trace."
      />
      <RewardsTabs active="/rewards/accounts" />

      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        action="/rewards/accounts"
      >
        <label className="text-xs text-muted-foreground">
          Name or username
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            className="mt-1 block w-56 rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 block rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
        >
          Search
        </button>
      </form>

      {res.status !== 200 ? (
        <EmptyState>
          {res.message ?? "Couldn't load credit accounts."}
        </EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>
          No credit accounts match. Accounts appear once credit is first granted
          to a user.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th className="text-right">Available</Th>
              <Th className="text-right">Pending</Th>
              <Th className="text-right">Earned (lifetime)</Th>
              <Th>Status</Th>
              <Th>Last change</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((a) => (
              <tr key={a.userId} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/rewards/accounts/${a.userId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.fullName || a.username || `${a.userId.slice(0, 8)}…`}
                  </Link>
                  {a.username ? (
                    <div className="text-xs text-muted-foreground">
                      @{a.username}
                    </div>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatCredit(a.availableMinor)}
                </Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {formatCredit(a.pendingMinor)}
                </Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {formatCredit(a.lifetimeEarnedMinor)}
                </Td>
                <Td>
                  <Badge
                    tone={
                      a.status === "frozen"
                        ? "warning"
                        : a.status === "closed"
                          ? "neutral"
                          : "success"
                    }
                  >
                    {a.status}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(a.updatedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/rewards/accounts?${qs({ cursor: res.nextCursor })}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
