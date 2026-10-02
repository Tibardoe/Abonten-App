"use client";

import { deletePromoCode } from "@/actions/deletePromoCode";
import type { EventPromoCode } from "@/actions/getEventPromoCodes";
import { getEventPromoCodes } from "@/actions/getEventPromoCodes";
import { updatePromoCode } from "@/actions/updatePromoCode";
import ModalShell from "@/components/atoms/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { formatDateTime, formatPercent } from "@abonten/core/i18n/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

type ManagePromoCodesModalProps = {
  eventId: string;
  handleClosePopup: (state: boolean) => void;
};

type EditState = {
  discountPercentage: number;
  maxUses: number | null;
  // yyyy-MM-ddThh:mm, the format <input type="datetime-local"> uses.
  expiresAt: string;
  isActive: boolean;
};

function toDateTimeLocalValue(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ManagePromoCodesModal({
  eventId,
  handleClosePopup,
}: ManagePromoCodesModalProps) {
  const locale = useLocale();
  const t = useTranslations("common");

  const queryClient = useQueryClient();
  const toast = useToast();

  const queryKey = ["event-promo-codes", eventId];
  const { data: response, isLoading } = useQuery({
    queryKey,
    queryFn: () => getEventPromoCodes(eventId),
  });

  const promoCodes = response?.status === 200 ? response.data : [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // EventPromoBreakdown reads from a separate analytics source
    // (ticket_checkout.promo_code text, not this table), but a
    // deactivation/discount change should still be reflected there.
    queryClient.invalidateQueries({
      queryKey: ["event-analytics-promo", eventId],
    });
  };

  const updateMutation = useMutation({
    mutationFn: updatePromoCode,
    onSuccess: (result) => {
      if (result.status === 200) {
        setEditingId(null);
        setEditState(null);
        invalidate();
        toast.success(result.message ?? t("promoCodeUpdated"));
      } else {
        toast.error(result.message ?? t("weCouldnTUpdateThatPromo"));
      }
    },
    onError: () => toast.error(t("weCouldnTUpdateThatPromo2")),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: (result) => {
      if (result.status === 200) {
        setDeletingId(null);
        invalidate();
        toast.success(result.message ?? t("promoCodeDeleted"));
      } else {
        toast.error(result.message ?? t("weCouldnTDeleteThatPromo"));
      }
    },
    onError: () => toast.error(t("weCouldnTDeleteThatPromo2")),
  });

  const startEdit = (code: EventPromoCode) => {
    setEditingId(code.id);
    setEditState({
      discountPercentage: code.discountPercentage ?? 0,
      maxUses: code.maxUses,
      expiresAt: toDateTimeLocalValue(code.expiresAt),
      isActive: code.isActive,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = (promoCodeId: string) => {
    if (!editState || !editState.expiresAt) return;

    updateMutation.mutate({
      promoCodeId,
      discountPercentage: editState.discountPercentage,
      maxUses: editState.maxUses,
      expiresAt: new Date(editState.expiresAt),
      isActive: editState.isActive,
    });
  };

  return (
    <>
      <ModalShell
        open
        onClose={() => handleClosePopup(false)}
        title={t("managePromoCodes")}
        className="bg-background md:bg-transparent"
      >
        <div className="flex flex-col h-full w-full md:h-[85%] md:w-[50%] lg:w-[40%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">{t("managePromoCodes")}</h1>
            <button
              type="button"
              onClick={() => handleClosePopup(false)}
              className="font-bold"
            >
              {t("close")}
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : promoCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("thisEventHasNoPromoCodes")}
            </p>
          ) : (
            <ul className="space-y-3">
              {promoCodes.map((code) => (
                <li
                  key={code.id}
                  className="space-y-2 border border-border rounded-md p-3 shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{code.promoCode}</p>
                      <p className="text-xs text-muted-foreground">
                        {code.maxUses !== null
                          ? t("usesOfMax", {
                              count: code.timesUsed,
                              maxUses: code.maxUses,
                            })
                          : t("usesUnlimited", { count: code.timesUsed })}
                      </p>
                    </div>
                    <span
                      className={
                        code.isActive
                          ? "text-xs font-semibold text-success shrink-0"
                          : "text-xs font-semibold text-muted-foreground shrink-0"
                      }
                    >
                      {code.isActive ? t("active") : t("inactive")}
                    </span>
                  </div>

                  {editingId === code.id && editState ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={editState.discountPercentage}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              discountPercentage: Number(e.target.value),
                            })
                          }
                          placeholder={t("discount4")}
                        />
                        <Input
                          type="number"
                          value={editState.maxUses ?? ""}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              maxUses:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          placeholder={t("maxUsesBlankUnlimited")}
                        />
                      </div>

                      <Input
                        type="datetime-local"
                        value={editState.expiresAt}
                        onChange={(e) =>
                          setEditState({
                            ...editState,
                            expiresAt: e.target.value,
                          })
                        }
                      />

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editState.isActive}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              isActive: e.target.checked,
                            })
                          }
                        />
                        {t("active")}
                      </label>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="flex-1"
                          disabled={
                            updateMutation.isPending || !editState.expiresAt
                          }
                          onClick={() => saveEdit(code.id)}
                        >
                          {updateMutation.isPending ? t("saving") : t("save")}
                        </Button>
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={cancelEdit}
                          disabled={updateMutation.isPending}
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <p>{t("discount2")}</p>
                          <p>
                            {formatPercent(code.discountPercentage, locale, {
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div className="flex justify-between">
                          <p>{t("expires")}</p>
                          <p>
                            {code.expiresAt
                              ? formatDateTime(code.expiresAt, locale)
                              : t("never")}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-border px-3 py-1 text-sm hover:bg-accent transition-colors"
                          onClick={() => startEdit(code)}
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-destructive text-destructive px-3 py-1 text-sm hover:bg-destructive/10 transition-colors"
                          onClick={() => setDeletingId(code.id)}
                        >
                          {t("deleteText")}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ModalShell>

      {deletingId && (
        <ConfirmDeleteModal
          title={t("deleteThisPromoCode")}
          message={t("deleteThisPromoCodeIfIt")}
          confirmLabel={t("deleteCode")}
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </>
  );
}
