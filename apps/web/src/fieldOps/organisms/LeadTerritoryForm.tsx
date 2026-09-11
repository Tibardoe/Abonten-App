"use client";

import { upsertFieldOpsLeadTerritory } from "@/actions/fieldOps/upsertFieldOpsLeadTerritory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Add or edit a town/area. "Find on the map" geocodes the name through the
 * app's existing /api/geocode proxy; coordinates can also be typed.
 */
export default function LeadTerritoryForm({
  campaignId,
  towns,
  initial,
  onDone,
}: {
  campaignId: string;
  /** Existing towns, for the "part of" picker on areas. */
  towns: FieldOpsTerritory[];
  initial?: FieldOpsTerritory;
  onDone?: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"town" | "area">(initial?.kind ?? "town");
  const [parent, setParent] = useState(initial?.parentTerritoryId ?? "");
  const [lat, setLat] = useState(initial ? String(initial.centre.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.centre.lng) : "");
  const [radius, setRadius] = useState(String(initial?.radiusM ?? 4000));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const locate = async () => {
    if (!name.trim()) {
      toast.error("Type the town's name first.");
      return;
    }
    setLocating(true);
    try {
      const res = await fetch(
        `/api/geocode?address=${encodeURIComponent(`${name}, Ghana`)}`,
      );
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        error?: string;
      };
      if (!res.ok || data.lat === undefined || data.lng === undefined) {
        toast.error(data.error ?? "Couldn't find that on the map.");
        return;
      }
      setLat(String(data.lat));
      setLng(String(data.lng));
      toast.success("Found it. Check the pin, then save.");
    } catch {
      toast.error("Couldn't find that on the map.");
    } finally {
      setLocating(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await upsertFieldOpsLeadTerritory({
        campaignId,
        id: initial?.id,
        name,
        kind,
        parentTerritoryId: kind === "area" && parent ? parent : null,
        centre: { lat: Number(lat), lng: Number(lng) },
        radiusM: Number(radius),
        boundary: initial?.boundary ?? null,
        notes: notes || null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Saved.");
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't save that.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="t-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ejisu"
            />
            <Button
              type="button"
              variant="outline"
              onClick={locate}
              disabled={locating}
            >
              {locating ? "Finding…" : "Find on the map"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-kind">Kind</Label>
          <Select
            id="t-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "town" | "area")}
          >
            <option value="town">Town</option>
            <option value="area">Area within a town</option>
          </Select>
        </div>
        {kind === "area" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-parent">Part of</Label>
            <Select
              id="t-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">— none —</option>
              {towns
                .filter((t) => t.id !== initial?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-lat">Latitude</Label>
          <Input
            id="t-lat"
            required
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-lng">Longitude</Label>
          <Input
            id="t-lng"
            required
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-radius">Radius (metres)</Label>
          <Input
            id="t-radius"
            required
            type="number"
            min={100}
            max={50000}
            step={100}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="t-notes">Notes for the team</Label>
        <Textarea
          id="t-notes"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {initial ? "Save changes" : "Add territory"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
