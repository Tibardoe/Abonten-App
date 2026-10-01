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
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

// Settings › Blocked accounts: everyone you blocked, and the way back. A
// block is account-wide — they can't message you (or you them), their
// reviews, Spotlights and comments are hidden from you, and any follow
// between you ended. Unblocking lifts it from now on; it doesn't restore a
// follow.

const QUERY_KEY = ["blocked-accounts"];

function BlockedRow({ account }: { account: BlockedAccount }) {
  const locale = useLocale();

  const t = useTranslations("settings");

  const toast = useToast();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const name = blockedAccountName(account);
  const unblock = useMutation({
    mutationFn: () => setUserBlock({ userId: account.userId, block: false }),
    onSuccess: (res) => {
      if (res.status === 200) {
        setDone(true);
        toast.success(t("isUnblocked", { name: name }));
        queryClient.invalidateQueries({ queryKey: ["reviews"] });
      } else {
        toast.error(res.message ?? t("couldnTUnblockTryAgain"));
      }
    },
    onError: () => toast.error(t("couldnTUnblockTryAgain")),
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
          {t("blocked", {
            getRelativeTime: getRelativeTime(
              account.blockedAt,
              undefined,
              locale,
            ),
          })}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={done || unblock.isPending}
        onClick={() => unblock.mutate()}
        aria-label={t("unblock2", { name: name })}
      >
        {done
          ? t("unblocked")
          : unblock.isPending
            ? t("unblocking")
            : t("unblock")}
      </Button>
    </li>
  );
}

export default function BlockedAccountsList() {
  const t = useTranslations("settings");

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
        {t("peopleYouBlockCanTMessage")}
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadYourBlocked")}
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">{t("youHavenTBlockedAnyone")}</p>
          <p className="text-sm text-muted-foreground">
            {t("youCanBlockSomeoneFromTheir")}
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
