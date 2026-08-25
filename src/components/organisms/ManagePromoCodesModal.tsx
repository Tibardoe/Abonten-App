"use client";

import { deletePromoCode } from "@/actions/deletePromoCode";
import type { EventPromoCode } from "@/actions/getEventPromoCodes";
import { getEventPromoCodes } from "@/actions/getEventPromoCodes";
import { updatePromoCode } from "@/actions/updatePromoCode";
import Notification from "@/components/atoms/Notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  useBodyScrollLock(true);

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

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
      }
      showMessage(result.message ?? "Something went wrong.");
    },
    onError: () => showMessage("Something went wrong. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: (result) => {
      if (result.status === 200) {
        setDeletingId(null);
        invalidate();
      }
      showMessage(result.message ?? "Something went wrong.");
    },
    onError: () => showMessage("Something went wrong. Please try again."),
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
      <div className="fixed inset-0 z-30 bg-background md:bg-overlay/50 md:flex md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full md:h-[85%] md:w-[50%] lg:w-[40%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Manage Promo Codes</h1>
            <button
              type="button"
              onClick={() => handleClosePopup(false)}
              className="font-bold"
            >
              Close
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : promoCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This event has no promo codes.
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
                        {code.timesUsed} use{code.timesUsed === 1 ? "" : "s"}
                        {code.maxUses !== null
                          ? ` of ${code.maxUses} max`
                          : " (unlimited)"}
                      </p>
                    </div>
                    <span
                      className={
                        code.isActive
                          ? "text-xs font-semibold text-success shrink-0"
                          : "text-xs font-semibold text-muted-foreground shrink-0"
                      }
                    >
                      {code.isActive ? "Active" : "Inactive"}
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
                          placeholder="Discount %"
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
                          placeholder="Max uses (blank = unlimited)"
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
                        Active
                      </label>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="flex-1 bg-mint"
                          disabled={
                            updateMutation.isPending || !editState.expiresAt
                          }
                          onClick={() => saveEdit(code.id)}
                        >
                          {updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={cancelEdit}
                          disabled={updateMutation.isPending}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <p>Discount</p>
                          <p>{code.discountPercentage}%</p>
                        </div>
                        <div className="flex justify-between">
                          <p>Expires</p>
                          <p>
                            {code.expiresAt
                              ? new Date(code.expiresAt).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-border px-3 py-1 text-sm hover:bg-accent transition-colors"
                          onClick={() => startEdit(code)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-destructive text-destructive px-3 py-1 text-sm hover:bg-destructive/10 transition-colors"
                          onClick={() => setDeletingId(code.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {deletingId && (
        <ConfirmDeleteModal
          message="Delete this promo code? If it's already been used, it will be deactivated instead so redemption history is preserved."
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
