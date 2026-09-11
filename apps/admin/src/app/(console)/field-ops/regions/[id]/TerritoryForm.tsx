"use client";

import { Button, Card, cn } from "@/components/ui";
import {
  geocodeFieldOpsQuery,
  upsertFieldOpsTerritory,
} from "@/server/actions";
import type {
  FieldOpsTerritory,
  FieldOpsTerritoryKind,
  FieldOpsTerritoryStatus,
  GeoJsonPolygon,
} from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type Parent = Pick<FieldOpsTerritory, "id" | "name">;

function useTerritoryState(t?: FieldOpsTerritory) {
  const [name, setName] = useState(t?.name ?? "");
  const [kind, setKind] = useState<FieldOpsTerritoryKind>(t?.kind ?? "town");
  const [parentId, setParentId] = useState(t?.parentTerritoryId ?? "");
  const [lat, setLat] = useState(t ? String(t.centre.lat) : "");
  const [lng, setLng] = useState(t ? String(t.centre.lng) : "");
  const [radiusKm, setRadiusKm] = useState(t ? String(t.radiusM / 1000) : "5");
  const [boundary, setBoundary] = useState(
    t?.boundary ? JSON.stringify(t.boundary) : "",
  );
  const [status, setStatus] = useState<FieldOpsTerritoryStatus>(
    t?.status ?? "active",
  );
  const [priority, setPriority] = useState(String(t?.priority ?? 0));
  const [notes, setNotes] = useState(t?.notes ?? "");
  return {
    name,
    setName,
    kind,
    setKind,
    parentId,
    setParentId,
    lat,
    setLat,
    lng,
    setLng,
    radiusKm,
    setRadiusKm,
    boundary,
    setBoundary,
    status,
    setStatus,
    priority,
    setPriority,
    notes,
    setNotes,
  };
}

function parseBoundary(text: string): GeoJsonPolygon | null | "invalid" {
  if (text.trim() === "") return null;
  try {
    const parsed = JSON.parse(text) as GeoJsonPolygon;
    if (parsed?.type !== "Polygon" || !Array.isArray(parsed.coordinates)) {
      return "invalid";
    }
    return parsed;
  } catch {
    return "invalid";
  }
}

function Fields({
  s,
  parents,
  selfId,
  showStatus,
  onGeocode,
  pending,
}: {
  s: ReturnType<typeof useTerritoryState>;
  parents: Parent[];
  selfId?: string;
  showStatus: boolean;
  onGeocode: () => void;
  pending: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium">Name</span>
        <input
          value={s.name}
          onChange={(e) => s.setName(e.target.value)}
          placeholder="e.g. Kumasi"
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Kind</span>
        <select
          value={s.kind}
          onChange={(e) => s.setKind(e.target.value as FieldOpsTerritoryKind)}
          className={cn(input, "mt-1")}
        >
          <option value="town">Town</option>
          <option value="area">Area (inside a town)</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Parent town</span>
        <select
          value={s.parentId}
          onChange={(e) => s.setParentId(e.target.value)}
          className={cn(input, "mt-1")}
        >
          <option value="">none</option>
          {parents
            .filter((p) => p.id !== selfId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Centre latitude</span>
        <input
          value={s.lat}
          onChange={(e) => s.setLat(e.target.value)}
          inputMode="decimal"
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Centre longitude</span>
        <input
          value={s.lng}
          onChange={(e) => s.setLng(e.target.value)}
          inputMode="decimal"
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Radius (km)</span>
        <input
          value={s.radiusKm}
          onChange={(e) => s.setRadiusKm(e.target.value)}
          inputMode="decimal"
          className={cn(input, "mt-1")}
        />
      </label>
      <div className="flex items-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || s.name.trim().length < 2}
          onClick={onGeocode}
        >
          Find on the map
        </Button>
      </div>
      <label className="block text-sm sm:col-span-4">
        <span className="font-medium">Boundary (optional GeoJSON Polygon)</span>
        <span className="block text-xs text-muted-foreground">
          When set it replaces the circle. Paste{" "}
          {`{"type":"Polygon","coordinates":[[[lng,lat],…]]}`} with a closed
          ring.
        </span>
        <textarea
          value={s.boundary}
          onChange={(e) => s.setBoundary(e.target.value)}
          rows={2}
          className={cn(input, "mt-1 font-mono text-xs")}
        />
      </label>
      {showStatus ? (
        <label className="block text-sm">
          <span className="font-medium">Status</span>
          <select
            value={s.status}
            onChange={(e) =>
              s.setStatus(e.target.value as FieldOpsTerritoryStatus)
            }
            className={cn(input, "mt-1")}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="retired">Retired</option>
          </select>
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="font-medium">Priority</span>
        <input
          value={s.priority}
          onChange={(e) => s.setPriority(e.target.value)}
          inputMode="numeric"
          className={cn(input, "mt-1 w-20")}
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="font-medium">Notes</span>
        <input
          value={s.notes}
          onChange={(e) => s.setNotes(e.target.value)}
          className={cn(input, "mt-1")}
        />
      </label>
    </div>
  );
}

type BuiltInput =
  | { error: string }
  | { value: Parameters<typeof upsertFieldOpsTerritory>[0] & object };

function buildInput(
  s: ReturnType<typeof useTerritoryState>,
  regionId: string,
  id?: string,
): BuiltInput {
  const boundary = parseBoundary(s.boundary);
  if (boundary === "invalid")
    return { error: "The boundary isn't a valid GeoJSON Polygon." };
  return {
    value: {
      id,
      regionId,
      parentTerritoryId: s.parentId || null,
      name: s.name.trim(),
      kind: s.kind,
      centre: { lat: Number(s.lat), lng: Number(s.lng) },
      radiusM: Math.round(Number(s.radiusKm) * 1000),
      boundary,
      status: s.status,
      priority: Math.round(Number(s.priority) || 0),
      notes: s.notes.trim() || null,
    },
  };
}

export function TerritoryForm({
  regionId,
  regionName,
  countryCode,
  parents,
}: {
  regionId: string;
  regionName: string;
  countryCode: string;
  parents: Parent[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const s = useTerritoryState();

  const geocode = () =>
    start(async () => {
      const res = await geocodeFieldOpsQuery({
        query: `${s.name}, ${regionName}, ${countryCode}`,
      });
      if (res.status === 200 && "data" in res && res.data) {
        s.setLat(String(res.data.lat));
        s.setLng(String(res.data.lng));
        setMsg(`Found: ${res.data.label}`);
      } else setMsg(res.message ?? "Couldn't geocode");
    });

  const submit = () =>
    start(async () => {
      setMsg(null);
      const built = buildInput(s, regionId);
      if ("error" in built) {
        setMsg(built.error);
        return;
      }
      const res = await upsertFieldOpsTerritory(built.value);
      setMsg(res.message ?? null);
      if (res.status === 200) {
        s.setName("");
        s.setBoundary("");
        s.setNotes("");
        router.refresh();
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <Fields
        s={s}
        parents={parents}
        showStatus={false}
        onGeocode={geocode}
        pending={pending}
      />
      <div className="flex items-center gap-2">
        <Button
          disabled={
            pending || s.name.trim().length < 2 || s.lat === "" || s.lng === ""
          }
          onClick={submit}
        >
          {pending ? "Saving…" : "Add territory"}
        </Button>
        {msg ? (
          <span className="text-xs text-muted-foreground">{msg}</span>
        ) : null}
      </div>
    </Card>
  );
}

export function TerritoryRowEdit({
  territory,
  parents,
}: {
  territory: FieldOpsTerritory;
  parents: Parent[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = useTerritoryState(territory);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit…
      </Button>
    );
  }

  const submit = () =>
    start(async () => {
      setMsg(null);
      const built = buildInput(s, territory.regionId, territory.id);
      if ("error" in built) {
        setMsg(built.error);
        return;
      }
      const res = await upsertFieldOpsTerritory(built.value);
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2 rounded border border-border p-2">
      <Fields
        s={s}
        parents={parents}
        selfId={territory.id}
        showStatus
        onGeocode={() => undefined}
        pending={pending}
      />
      <div className="flex gap-1">
        <Button size="sm" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
