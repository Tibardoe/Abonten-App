"use client";

import getOrganizerPayoutAccounts from "@/actions/getOrganizerPayoutAccounts";
import removePayoutAccount from "@/actions/removePayoutAccount";
import setDefaultPayoutAccount from "@/actions/setDefaultPayoutAccount";
import Notification from "@/components/atoms/Notification";
import { Skeleton } from "@/components/ui/skeleton";
import type { PayoutAccountRow } from "@/types/organizerFinance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IoMdAddCircle } from "react-icons/io";
import PayoutAccountCard from "../molecules/PayoutAccountCard";
import AddPayoutAccountPopup from "./AddPayoutAccountPopup";

type PayoutAccountManagerProps = {
  initialAccounts: PayoutAccountRow[];
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
  const queryClient = useQueryClient();
  const [notification, setNotification] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PAYOUT_ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      const response = await getOrganizerPayoutAccounts();
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
      queryClient.invalidateQueries({ queryKey: PAYOUT_ACCOUNTS_QUERY_KEY });
    },
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message ?? "Failed to remove payout account.");
      }
    },
    onError: () => setNotification("Failed to remove payout account."),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultPayoutAccount(id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PAYOUT_ACCOUNTS_QUERY_KEY }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message ?? "Failed to update default.");
      }
    },
    onError: () => setNotification("Failed to update default."),
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
        <p>Couldn't load your payout accounts.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <div className="text-center py-8 space-y-1">
          <p className="font-medium">No payout accounts added yet.</p>
          <p className="text-sm text-muted-foreground">
            Add a mobile money or bank account to receive your earnings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <PayoutAccountCard
              key={account.id}
              account={account}
              onSetDefault={() => setDefaultMutation.mutate(account.id)}
              onRemove={() => removeMutation.mutate(account.id)}
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
        Add payout account
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

      {notification && <Notification notification={notification} />}
    </div>
  );
}
