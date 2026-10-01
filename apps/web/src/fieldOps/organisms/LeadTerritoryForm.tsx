"use client";

import { upsertFieldOpsLeadTerritory } from "@/actions/fieldOps/upsertFieldOpsLeadTerritory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Add or edit a town/area. "Find on the map" geocodes the name through the
 * app's existing /api/geocode proxy; coordinates can also be typed.
 */
export default function LeadTerritoryForm({
  campaignId,
  placeContext,
  towns,
  initial,
  onDone,
}: {
  campaignId: string;
  /** "Ashanti, Ghana" — appended to the typed town name for geocoding. */
  placeContext: string;
  /** Existing towns, for the "part of" picker on areas. */
  towns: FieldOpsTerritory[];
  initial?: FieldOpsTerritory;
  onDone?: () => void;
}) {
  const t = useTranslations("fieldOps");

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
      toast.error(t("typeTheTownSNameFirst"));
      return;
    }
    setLocating(true);
    try {
      const res = await fetch(
        `/api/geocode?address=${encodeURIComponent(placeContext ? `${name}, ${placeContext}` : name)}`,
      );
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        error?: string;
      };
      if (!res.ok || data.lat === undefined || data.lng === undefined) {
        toast.error(data.error ?? t("couldnTFindThatOnThe"));
        return;
      }
      setLat(String(data.lat));
      setLng(String(data.lng));
      toast.success(t("foundItCheckThePinThen"));
    } catch {
      toast.error(t("couldnTFindThatOnThe"));
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
        toast.success(res.message ?? t("saved"));
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSaveThat"));
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
          <Label htmlFor="t-name">{t("name")}</Label>
          <div className="flex gap-2">
            <Input
              id="t-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("eGEjisu")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={locate}
              disabled={locating}
            >
              {locating ? t("finding") : t("findOnTheMap")}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-kind">{t("kind")}</Label>
          <Select
            id="t-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "town" | "area")}
          >
            <option value="town">{t("town")}</option>
            <option value="area">{t("areaWithinATown")}</option>
          </Select>
        </div>
        {kind === "area" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-parent">{t("partOf")}</Label>
            <Select
              id="t-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">{t("none")}</option>
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
          <Label htmlFor="t-lat">{t("latitude")}</Label>
          <Input
            id="t-lat"
            required
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-lng">{t("longitude")}</Label>
          <Input
            id="t-lng"
            required
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-radius">{t("radiusMetres")}</Label>
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
        <Label htmlFor="t-notes">{t("notesForTheTeam")}</Label>
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
          {initial ? t("saveChanges") : t("addTerritory")}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
