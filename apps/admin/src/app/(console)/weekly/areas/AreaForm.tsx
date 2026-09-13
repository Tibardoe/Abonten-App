"use client";

import { Button, Card, cn } from "@/components/ui";
import { geocodeWeeklyArea, upsertWeeklyScope } from "@/server/actions";
import type { WeeklyScope } from "@abonten/types/weeklyType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function AreaForm({ scope }: { scope?: WeeklyScope }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState(scope?.name ?? "");
  const [slug, setSlug] = useState(scope?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!scope);
  const [lat, setLat] = useState(scope?.centreLat?.toString() ?? "");
  const [lng, setLng] = useState(scope?.centreLng?.toString() ?? "");
  const [radius, setRadius] = useState(scope?.radiusKm?.toString() ?? "25");
  const [position, setPosition] = useState(String(scope?.position ?? 100));
  const [status, setStatus] = useState<"active" | "retired">(
    scope?.status ?? "active",
  );
  const [reason, setReason] = useState("");

  const lookup = () =>
    start(async () => {
      setMsg(null);
      const res = await geocodeWeeklyArea({ query: `${name}, Ghana` });
      if (res.status === 200 && "data" in res && res.data) {
        setLat(res.data.lat.toFixed(6));
        setLng(res.data.lng.toFixed(6));
        setMsg({ ok: true, text: `Found: ${res.data.label}` });
      } else {
        setMsg({ ok: false, text: res.message ?? "No match." });
      }
    });

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        scope &&
        status === "retired" &&
        scope.status === "active" &&
        !window.confirm(
          `Retire ${scope.name}? Its editions stop being shown and visitors there see Ghana-wide picks.`,
        )
      ) {
        return;
      }
      const res = await upsertWeeklyScope({
        scopeId: scope?.id,
        expectedUpdatedAt: scope?.updatedAt,
        reason,
        scope: {
          name,
          slug,
          centreLat: Number(lat),
          centreLng: Number(lng),
          radiusKm: Number(radius),
          position: Number(position),
          status,
        },
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        if (!scope) {
          setName("");
          setSlug("");
          setSlugTouched(false);
          setLat("");
          setLng("");
        }
        router.refresh();
      }
    });

  const valid =
    name.trim().length >= 2 &&
    slug.length >= 1 &&
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number(radius) >= 1 &&
    Number(radius) <= 300 &&
    reason.trim().length >= 5;

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">
        {scope ? `Edit ${scope.name}` : "Add an area"}
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Name</span>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(toSlug(e.target.value));
            }}
            placeholder="e.g. Accra"
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">Address</span>
          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            /weekly/
            <input
              value={slug}
              maxLength={40}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(toSlug(e.target.value));
              }}
              className={cn(input, "font-mono")}
            />
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Latitude</span>
          <input
            value={lat}
            inputMode="decimal"
            onChange={(e) => setLat(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Longitude</span>
          <input
            value={lng}
            inputMode="decimal"
            onChange={(e) => setLng(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Radius (km)</span>
          <input
            value={radius}
            inputMode="numeric"
            onChange={(e) => setRadius(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Order</span>
          <input
            value={position}
            inputMode="numeric"
            onChange={(e) => setPosition(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        {scope ? (
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
        <label className="block text-sm sm:col-span-3">
          <span className="font-medium">Reason (audit log)</span>
          <input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || name.trim().length < 2}
          onClick={lookup}
        >
          Look up centre
        </Button>
        <Button size="sm" disabled={pending || !valid} onClick={save}>
          {scope ? "Save area" : "Add area"}
        </Button>
        {msg ? (
          <span
            role={msg.ok ? "status" : "alert"}
            className={cn(
              "text-xs",
              msg.ok ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
