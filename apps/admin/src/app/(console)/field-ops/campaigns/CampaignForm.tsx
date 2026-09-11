"use client";

import { Button, Card, cn } from "@/components/ui";
import { upsertFieldOpsCampaign } from "@/server/actions";
import type { FieldOpsCampaign, FieldOpsRegion } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

const cedis = (minor: number | null) =>
  minor === null ? "" : (minor / 100).toFixed(2);

/** Create a campaign (draft) or edit an existing one's details. */
export function CampaignForm({
  regions,
  campaign,
}: {
  regions: Pick<FieldOpsRegion, "id" | "name" | "liveCampaignId">[];
  campaign?: FieldOpsCampaign;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(campaign?.name ?? "");
  const [regionId, setRegionId] = useState(
    campaign?.regionId ?? regions[0]?.id ?? "",
  );
  const [currency, setCurrency] = useState(campaign?.currency ?? "GHS");
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? "");
  const [budget, setBudget] = useState(cedis(campaign?.budgetCapMinor ?? null));
  const [holding, setHolding] = useState(
    campaign?.holdingDaysOverride === null ||
      campaign?.holdingDaysOverride === undefined
      ? ""
      : String(campaign.holdingDaysOverride),
  );
  const [description, setDescription] = useState(campaign?.description ?? "");

  const editingRegion = !campaign || campaign.status === "draft";

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await upsertFieldOpsCampaign({
        id: campaign?.id,
        regionId,
        name: name.trim(),
        currency: currency.trim().toUpperCase(),
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        budgetCapMinor:
          budget.trim() === "" ? null : Math.round(Number(budget) * 100),
        holdingDaysOverride:
          holding.trim() === "" ? null : Math.round(Number(holding)),
        description: description.trim() || null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        if (!campaign) {
          setName("");
          setDescription("");
        }
        router.refresh();
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ashanti 2026 pilot"
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Region</span>
          <select
            value={regionId}
            disabled={!editingRegion}
            onChange={(e) => setRegionId(e.target.value)}
            className={cn(input, "mt-1")}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.liveCampaignId && r.liveCampaignId !== campaign?.id
                  ? " (has a live campaign)"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Currency</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={3}
            className={cn(input, "mt-1 w-24 uppercase")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Budget cap</span>
          <span className="block text-xs text-muted-foreground">
            Optional. Commissions stay pending once approved + paid would pass
            it.
          </span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            className={cn(input, "mt-1 w-40")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Starts on</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Ends on</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Holding period override</span>
          <span className="block text-xs text-muted-foreground">
            Days before a verified onboarding pays. Empty = programme default.
          </span>
          <input
            value={holding}
            onChange={(e) => setHolding(e.target.value)}
            inputMode="numeric"
            className={cn(input, "mt-1 w-24")}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={cn(input, "mt-1")}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          disabled={pending || name.trim().length < 2 || !regionId}
          onClick={submit}
        >
          {pending
            ? "Saving…"
            : campaign
              ? "Save changes"
              : "Create draft campaign"}
        </Button>
        {msg ? (
          <span className="text-xs text-muted-foreground">{msg}</span>
        ) : null}
      </div>
    </Card>
  );
}
