"use client";

import { Button, Card, cn } from "@/components/ui";
import { geocodeFieldOpsQuery, upsertFieldOpsRegion } from "@/server/actions";
import type { FieldOpsRegion } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

export function RegionForm({ region }: { region?: FieldOpsRegion }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(region?.name ?? "");
  const [countryCode, setCountryCode] = useState(region?.countryCode ?? "GH");
  const [adminCode, setAdminCode] = useState(region?.adminCode ?? "");
  const [lat, setLat] = useState(
    region?.centre ? String(region.centre.lat) : "",
  );
  const [lng, setLng] = useState(
    region?.centre ? String(region.centre.lng) : "",
  );
  const [status, setStatus] = useState<"active" | "retired">(
    region?.status ?? "active",
  );
  const [notes, setNotes] = useState(region?.notes ?? "");

  const geocode = () =>
    start(async () => {
      const res = await geocodeFieldOpsQuery({
        query: `${name}, ${countryCode}`,
      });
      if (res.status === 200 && "data" in res && res.data) {
        setLat(String(res.data.lat));
        setLng(String(res.data.lng));
        setMsg(`Found: ${res.data.label}`);
      } else {
        setMsg(res.message ?? "Couldn't geocode");
      }
    });

  const submit = () =>
    start(async () => {
      setMsg(null);
      const hasCentre = lat.trim() !== "" && lng.trim() !== "";
      const res = await upsertFieldOpsRegion({
        id: region?.id,
        name: name.trim(),
        countryCode: countryCode.trim().toUpperCase(),
        adminCode: adminCode.trim() ? adminCode.trim().toUpperCase() : null,
        centre: hasCentre ? { lat: Number(lat), lng: Number(lng) } : null,
        status,
        notes: notes.trim() || null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        if (!region) {
          setName("");
          setAdminCode("");
          setLat("");
          setLng("");
          setNotes("");
        }
        router.refresh();
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ashanti"
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Country</span>
          <input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            maxLength={2}
            className={cn(input, "mt-1 w-20 uppercase")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">ISO code</span>
          <input
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
            placeholder="GH-AH"
            className={cn(input, "mt-1 uppercase")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Centre latitude</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Centre longitude</span>
          <input
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            inputMode="decimal"
            className={cn(input, "mt-1")}
          />
        </label>
        <div className="flex items-end">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || name.trim().length < 2}
            onClick={geocode}
          >
            Find on the map
          </Button>
        </div>
        {region ? (
          <label className="block text-sm">
            <span className="font-medium">Status</span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "retired")
              }
              className={cn(input, "mt-1")}
            >
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </select>
          </label>
        ) : null}
      </div>
      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={cn(input, "mt-1")}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button disabled={pending || name.trim().length < 2} onClick={submit}>
          {pending ? "Saving…" : region ? "Save region" : "Create region"}
        </Button>
        {msg ? (
          <span className="text-xs text-muted-foreground">{msg}</span>
        ) : null}
      </div>
    </Card>
  );
}
