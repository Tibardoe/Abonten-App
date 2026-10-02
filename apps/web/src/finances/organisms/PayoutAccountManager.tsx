"use client";

import getOrganizerPayoutAccounts from "@/actions/getOrganizerPayoutAccounts";
import removePayoutAccount from "@/actions/removePayoutAccount";
import setDefaultPayoutAccount from "@/actions/setDefaultPayoutAccount";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IoMdAddCircle } from "react-icons/io";
import PayoutAccountCard from "../molecules/PayoutAccountCard";
import AddPayoutAccountPopup from "./AddPayoutAccountPopup";

type PayoutAccountManagerProps = {
  /** Left out when the server could not read them: the list loads here. */
  initialAccounts?: PayoutAccountRow[];
};

export const PAYOUT_ACCOUNTS_QUERY_KEY = ["payout-accounts"];

/**
 * Finances > Payout Accounts. Mirrors WalletManager.tsx's structure exactly
 * (list + add button + popup), reading/writing only payout_account — never
 * the buyer-facing payment_method table.
 */
export default function PayoutAccountManager({
  initialAccounts,
}: PayoutAccountManagerProps) {
  const t = useTranslations("finances");

  const queryClient = useQueryClient();
  const toast = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PAYOUT_ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      const response = answerOrThrow(await getOrganizerPayoutAccounts());
      return response.status === 200 ? response.data : [];
    },
    initialData: initialAccounts,
  });

  const accounts = data ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: string) => removePayoutAccount(id),
    onMutate: (id) => setRemovingId(id),
    onSettled: () => {
      setRemovingId(null);
      setPendingRemoveId(null);
      queryClient.invalidateQueries({ queryKey: PAYOUT_ACCOUNTS_QUERY_KEY });
    },
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message ?? t("weCouldnTRemoveThatPayout"));
      } else {
        toast.success(t("payoutAccountRemoved"));
      }
    },
    onError: () => toast.error(t("weCouldnTRemoveThatPayout")),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultPayoutAccount(id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PAYOUT_ACCOUNTS_QUERY_KEY }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message ?? t("weCouldnTUpdateYourDefault"));
      }
    },
    onError: () => toast.error(t("weCouldnTUpdateYourDefault")),
  });

  if (isPending && accounts.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3 text-center text-muted-foreground py-8">
        <p>{t("couldnTLoadYourPayoutAccounts")}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline font-medium"
        >
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <div className="text-center py-8 space-y-1">
          <p className="font-medium">{t("noPayoutAccountsAddedYet")}</p>
          <p className="text-sm text-muted-foreground">
            {t("addAMobileMoneyOrBank")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <PayoutAccountCard
              key={account.id}
              account={account}
              onSetDefault={() => setDefaultMutation.mutate(account.id)}
              onRemove={() => setPendingRemoveId(account.id)}
              removing={removingId === account.id}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsAddOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        <IoMdAddCircle className="text-primary text-2xl" />
        {t("addPayoutAccount")}
      </button>

      {isAddOpen && (
        <AddPayoutAccountPopup
          onclick={() => setIsAddOpen(false)}
          onAdded={() => {
            setIsAddOpen(false);
            queryClient.invalidateQueries({
              queryKey: PAYOUT_ACCOUNTS_QUERY_KEY,
            });
          }}
        />
      )}

      {pendingRemoveId && (
        <ConfirmDeleteModal
          title={t("removeThisPayoutAccount")}
          message={t("youCanAddItAgainLater")}
          confirmLabel={t("remove")}
          loadingLabel={t("removing2")}
          isLoading={removeMutation.isPending}
          onConfirm={() => removeMutation.mutate(pendingRemoveId)}
          onCancel={() => setPendingRemoveId(null)}
        />
      )}
    </div>
  );
}
