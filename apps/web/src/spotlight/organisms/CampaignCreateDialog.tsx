"use client";

import { createContentCampaign } from "@/actions/content/createContentCampaign";
import { listCampaignPresets } from "@/actions/content/listCampaignPresets";
import { cn } from "@/components/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_OBJECTIVE_LABEL,
  SPONSORED_LABEL,
} from "@abonten/core/content/copy";
import type { ContentCampaignObjective } from "@abonten/types/contentType";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dataOf, messageOf } from "../lib/result";

function localInputValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Promote a live Spotlight with a fixed plan. The price comes from the
 * server-side preset; paying opens the normal checkout page. Nothing runs
 * until the payment is confirmed and the promotion passes review.
 */
export default function CampaignCreateDialog({
  postId,
  hasEvent,
  hasPlace,
  onClose,
}: {
  postId: string;
  hasEvent: boolean;
  hasPlace: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const presets = useQuery({
    queryKey: ["content", "campaign-presets"],
    queryFn: async () => dataOf(await listCampaignPresets()) ?? [],
  });
  const [presetId, setPresetId] = useState<number | null>(null);
  const objectives = CAMPAIGN_OBJECTIVES.filter((o) => {
    if (o === "event_views" || o === "ticket_sales") return hasEvent;
    if (o === "place_views" || o === "reservations") return hasPlace;
    return true;
  });
  const [objective, setObjective] = useState<ContentCampaignObjective>("views");
  const [startsAt, setStartsAt] = useState(() =>
    localInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [submitting, setSubmitting] = useState(false);

  const selected =
    presets.data?.find((p) => p.id === presetId) ?? presets.data?.[0] ?? null;

  const submit = async () => {
    if (!selected || submitting) return;
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) {
      toast.error("Choose a start date.");
      return;
    }
    setSubmitting(true);
    const res = await createContentCampaign({
      postId,
      presetId: selected.id,
      objective,
      startsAt: start.toISOString(),
      targeting: { categories: [] },
    });
    const data = dataOf(res);
    if (!data) {
      setSubmitting(false);
      toast.error(messageOf(res, "Couldn't start this promotion."));
      return;
    }
    router.push(`/checkout/${data.checkout.id}?type=spotlight-promotion`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Promote this Spotlight</DialogTitle>
        <DialogDescription>
          Promoted Spotlights appear in more feeds with a “{SPONSORED_LABEL}”
          label. Every promotion is reviewed before it runs; if it isn't
          approved, you're refunded in full.
        </DialogDescription>

        {presets.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !presets.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Promotion plans aren't available right now.
          </p>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Plan</legend>
              {presets.data.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm",
                    selected?.id === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="preset"
                      checked={selected?.id === p.id}
                      onChange={() => setPresetId(p.id)}
                    />
                    <span>
                      <span className="block font-semibold">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        Runs for {p.durationDays} days
                      </span>
                    </span>
                  </span>
                  <span className="font-semibold">
                    {formatMinor(p.budgetMinor, p.currency)}
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="block space-y-1 text-sm font-medium">
              <label htmlFor="campaign-field-1">Goal</label>
              <Select
                id="campaign-field-1"
                value={objective}
                onChange={(e) =>
                  setObjective(e.target.value as ContentCampaignObjective)
                }
              >
                {objectives.map((o) => (
                  <option key={o} value={o}>
                    {CAMPAIGN_OBJECTIVE_LABEL[o]}
                  </option>
                ))}
              </Select>
            </div>

            <label className="block space-y-1 text-sm font-medium">
              <span>Start (after approval)</span>
              <input
                type="datetime-local"
                value={startsAt}
                min={localInputValue(new Date())}
                onChange={(e) => setStartsAt(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <p className="text-xs text-muted-foreground">
              We don't promise a number of views. Promotion is paid by card or
              mobile money; Abonten Credit can't be used for it.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!selected || submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Starting…" : "Continue to payment"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
