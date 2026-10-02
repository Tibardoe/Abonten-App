"use client";

import getUserPaymentMethods, {
  type PaymentMethodRow,
} from "@/actions/getUserPaymentMethods";
import removePaymentMethod from "@/actions/removePaymentMethod";
import setDefaultPaymentMethod from "@/actions/setDefaultPaymentMethod";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import PaymentMethodCard, {
  NO_PAYMENT_METHODS_KEY,
} from "@/wallet/molecules/PaymentMethodCard";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

type WalletManagerProps = {
  /** Left out when the server could not read them: the list loads here. */
  initialPaymentMethods?: PaymentMethodRow[];
};

export const PAYMENT_METHODS_QUERY_KEY = ["payment-methods"];

/**
 * Wallet management, independent of any checkout — this is what /wallet
 * renders. It only ever reads/writes payment_method via
 * getUserPaymentMethods/addPaymentMethod/removePaymentMethod/
 * setDefaultPaymentMethod, none of which touch ticket_checkout or
 * subscription_checkout, so this works the same whether the user has zero,
 * one, or several pending checkouts elsewhere.
 */
export default function WalletManager({
  initialPaymentMethods,
}: WalletManagerProps) {
  const t = useTranslations("wallet");

  const queryClient = useQueryClient();
  const toast = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: async () => {
      const response = answerOrThrow(await getUserPaymentMethods());
      return response.status === 200 ? response.data : [];
    },
    initialData: initialPaymentMethods,
  });

  const methods = data ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: string) => removePaymentMethod(id),

    onMutate: async (id) => {
      setRemovingId(id);

      await queryClient.cancelQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });

      const previousMethods = queryClient.getQueryData<PaymentMethodRow[]>(
        PAYMENT_METHODS_QUERY_KEY,
      );

      queryClient.setQueryData<PaymentMethodRow[]>(
        PAYMENT_METHODS_QUERY_KEY,
        (old) => old?.filter((method) => method.id !== id),
      );

      return { previousMethods };
    },

    onSuccess: (response, _id, context) => {
      if (response.status !== 200) {
        if (context?.previousMethods) {
          queryClient.setQueryData(
            PAYMENT_METHODS_QUERY_KEY,
            context.previousMethods,
          );
        }
        toast.error(response.message ?? t("weCouldnTRemoveThatPayment"));
      } else {
        toast.success(t("paymentMethodRemoved"));
      }
    },

    onError: (_error, _id, context) => {
      if (context?.previousMethods) {
        queryClient.setQueryData(
          PAYMENT_METHODS_QUERY_KEY,
          context.previousMethods,
        );
      }
      toast.error(t("weCouldnTRemoveThatPayment"));
    },

    onSettled: () => {
      setRemovingId(null);
      setPendingRemoveId(null);
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultPaymentMethod(id),

    onMutate: async (id) => {
      setSettingDefaultId(id);

      await queryClient.cancelQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });

      const previousMethods = queryClient.getQueryData<PaymentMethodRow[]>(
        PAYMENT_METHODS_QUERY_KEY,
      );

      queryClient.setQueryData<PaymentMethodRow[]>(
        PAYMENT_METHODS_QUERY_KEY,
        (old) =>
          old?.map((method) => ({
            ...method,
            is_default: method.id === id,
          })),
      );

      return { previousMethods };
    },

    onSuccess: (response, _id, context) => {
      if (response.status !== 200) {
        if (context?.previousMethods) {
          queryClient.setQueryData(
            PAYMENT_METHODS_QUERY_KEY,
            context.previousMethods,
          );
        }
        toast.error(response.message ?? t("weCouldnTUpdateYourDefault"));
      }
    },

    onError: (_error, _id, context) => {
      if (context?.previousMethods) {
        queryClient.setQueryData(
          PAYMENT_METHODS_QUERY_KEY,
          context.previousMethods,
        );
      }
      toast.error(t("weCouldnTUpdateYourDefault"));
    },

    onSettled: () => {
      setSettingDefaultId(null);
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
    },
  });

  if (isPending && methods.length === 0) {
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
        <p>{t("couldnTLoadYourPaymentMethods")}</p>
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
      {methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(NO_PAYMENT_METHODS_KEY)}
        </p>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              onSetDefault={() => setDefaultMutation.mutate(method.id)}
              onRemove={() => setPendingRemoveId(method.id)}
              removing={removingId === method.id}
              settingDefault={settingDefaultId === method.id}
            />
          ))}
        </div>
      )}

      <AddWalletButton
        onAdded={() =>
          queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY })
        }
      />

      {pendingRemoveId && (
        <ConfirmDeleteModal
          title={t("removeThisPaymentMethod")}
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
