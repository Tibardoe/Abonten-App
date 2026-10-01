"use client";

import cancelEvent from "@/actions/cancelEvent";
import getEventCancellationImpact from "@/actions/getEventCancellationImpact";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MdOutlineCancel } from "react-icons/md";

type CancelProp = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
  /** Closes the parent dropdown once the confirm dialog is dismissed --
   * required when asMenuItem (see EventCardMenuBtn.tsx). */
  onRequestClose?: () => void;
};

function buildConfirmMessage(
  t: (key: string, values?: Record<string, number>) => string,
  impact:
    | {
        paidTicketCount: number;
        freeTicketCount: number;
        attendeeCount: number;
      }
    | undefined,
  isLoadingImpact: boolean,
): string {
  if (isLoadingImpact || !impact) {
    return t("cancelConfirm.checking");
  }

  if (impact.paidTicketCount > 0) {
    return t("cancelConfirm.paid", { count: impact.attendeeCount });
  }

  if (impact.freeTicketCount > 0) {
    return t("cancelConfirm.free", { count: impact.attendeeCount });
  }

  return t("cancelConfirm.none");
}

export default function CancelButton({
  eventId,
  asMenuItem,
  onRequestClose,
}: CancelProp) {
  const t = useTranslations("common");

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: impactResponse, isLoading: isLoadingImpact } = useQuery({
    queryKey: ["event-cancellation-impact", eventId],
    queryFn: () => getEventCancellationImpact(eventId),
    enabled: showCancelConfirm,
  });

  const impact =
    impactResponse?.status === 200 ? impactResponse.data : undefined;

  const closeConfirm = () => {
    setShowCancelConfirm(false);
    onRequestClose?.();
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: (response) => {
      if (response.status === 200) {
        closeConfirm();
        invalidateEventListQueries(queryClient);
        toast.success(response.message);
      } else {
        setError(response.message ?? t("failedUpdatingEventStatusPleaseTry"));
      }
    },
    onError: () => {
      setError(t("somethingWentWrongPleaseTryAgain2"));
    },
  });

  const openConfirm = () => {
    setError(null);
    setShowCancelConfirm(true);
  };

  return (
    <>
      {asMenuItem ? (
        <DropdownMenuItem
          onSelect={(event) => {
            // Keep the dropdown mounted -- otherwise Radix unmounts this
            // component (and the confirm-dialog state below) before the
            // dialog ever renders.
            event.preventDefault();
            openConfirm();
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <MdOutlineCancel className="text-xl" />
          {t("cancelEvent")}
        </DropdownMenuItem>
      ) : (
        <button
          onClick={openConfirm}
          type="button"
          className="flex items-center gap-1 p-1 text-destructive"
        >
          <MdOutlineCancel className="text-xl " />
          {t("cancelEvent")}
        </button>
      )}

      {showCancelConfirm && (
        <ConfirmDeleteModal
          title={t("cancelThisEvent")}
          message={error ?? buildConfirmMessage(t, impact, isLoadingImpact)}
          confirmLabel={t("cancelEvent")}
          cancelLabel={t("goBack")}
          loadingLabel={t("cancelling")}
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={closeConfirm}
        />
      )}
    </>
  );
}
