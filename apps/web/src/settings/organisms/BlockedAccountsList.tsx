"use client";

import { getBlockedAccounts } from "@/actions/getBlockedAccounts";
import { setUserBlock } from "@/actions/setUserBlock";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import {
  type BlockedAccount,
  blockedAccountName,
} from "@abonten/core/blockedAccounts";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

// Settings › Blocked accounts: everyone you blocked, and the way back. A
// block is account-wide — they can't message you (or you them), their
// reviews, Spotlights and comments are hidden from you, and any follow
// between you ended. Unblocking lifts it from now on; it doesn't restore a
// follow.

const QUERY_KEY = ["blocked-accounts"];

function BlockedRow({ account }: { account: BlockedAccount }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const name = blockedAccountName(account);
  const unblock = useMutation({
    mutationFn: () => setUserBlock({ userId: account.userId, block: false }),
    onSuccess: (res) => {
      if (res.status === 200) {
        setDone(true);
        toast.success(`${name} is unblocked`);
        queryClient.invalidateQueries({ queryKey: ["reviews"] });
      } else {
        toast.error(res.message ?? "Couldn't unblock. Try again.");
      }
    },
    onError: () => toast.error("Couldn't unblock. Try again."),
  });

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {account.avatarPublicId ? (
        <Image
          src={buildCloudinaryUrl(
            account.avatarPublicId,
            account.avatarVersion,
            { width: 40, height: 40 },
          )}
          alt=""
          width={40}
          height={40}
          className="rounded-full border border-border"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {account.fullName && account.username
            ? `@${account.username} · `
            : ""}
          Blocked {getRelativeTime(account.blockedAt)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={done || unblock.isPending}
        onClick={() => unblock.mutate()}
        aria-label={`Unblock ${name}`}
      >
        {done ? "Unblocked" : unblock.isPending ? "Unblocking…" : "Unblock"}
      </Button>
    </li>
  );
}

export default function BlockedAccountsList() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await getBlockedAccounts();
      if (res.status !== 200) throw new Error(res.message);
      return res.data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        People you block can&apos;t message you, and you won&apos;t see their
        reviews, Spotlights or comments. They aren&apos;t told.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <InlineErrorRetry
          message="We couldn't load your blocked accounts."
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">You haven&apos;t blocked anyone</p>
          <p className="text-sm text-muted-foreground">
            You can block someone from their review, message or Spotlight.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((account) => (
            <BlockedRow key={account.userId} account={account} />
          ))}
        </ul>
      )}
    </div>
  );
}
