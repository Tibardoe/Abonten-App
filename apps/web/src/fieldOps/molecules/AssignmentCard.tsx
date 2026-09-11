"use client";

import { completeFieldOpsAssignment } from "@/actions/fieldOps/completeFieldOpsAssignment";
import { startFieldOpsAssignment } from "@/actions/fieldOps/startFieldOpsAssignment";
import { Button } from "@/components/ui/button";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

function dateRange(a: FieldOpsAssignment) {
  return a.startsOn === a.endsOn ? a.startsOn : `${a.startsOn} → ${a.endsOn}`;
}

/** Reads the device position once; rejects with a readable message. */
function currentPosition(): Promise<{
  lat: number;
  lng: number;
  accuracyM: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      () =>
        reject(
          new Error(
            "Turn on location for this site so we can record where you started.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

/**
 * One assignment with its Start / Complete action. Offline members check
 * in with the device's GPS when they start; the position and its distance
 * to the territory are shown to the team lead.
 */
export default function AssignmentCard({
  assignment,
  canAct,
  today,
}: {
  assignment: FieldOpsAssignment;
  /** False while the campaign isn't active or the member can't act. */
  canAct: boolean;
  today: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const a = assignment;
  const isToday = a.startsOn <= today && a.endsOn >= today;

  const onStart = () =>
    start(async () => {
      let location: { lat: number; lng: number } | null = null;
      let accuracyM: number | null = null;
      if (a.mode === "offline") {
        try {
          const pos = await currentPosition();
          location = { lat: pos.lat, lng: pos.lng };
          accuracyM = pos.accuracyM;
        } catch (err) {
          toast.error((err as Error).message);
          return;
        }
      }
      const res = await startFieldOpsAssignment({
        campaignId: a.campaignId,
        assignmentId: a.id,
        location,
        accuracyM,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Started.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't start that.");
      }
    });

  const onComplete = () =>
    start(async () => {
      const res = await completeFieldOpsAssignment({
        campaignId: a.campaignId,
        assignmentId: a.id,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Completed.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't complete that.");
      }
    });

  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/field/territory/${a.territoryId}`}
            className="font-medium hover:underline"
          >
            {a.territoryName}
          </Link>
          <p className="text-sm text-muted-foreground">
            {dateRange(a)} · {a.mode === "offline" ? "In person" : "Online"}
          </p>
        </div>
        <StatusChip status={a.status} />
      </div>
      {a.notes ? <p className="mt-2 text-sm">{a.notes}</p> : null}
      {a.status === "started" && a.startDistanceM !== null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Checked in {Math.round(a.startDistanceM / 100) / 10} km from the town
          centre.
        </p>
      ) : null}
      {a.status === "cancelled" && a.cancelReason ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Cancelled: {a.cancelReason}
        </p>
      ) : null}
      {canAct && (a.status === "assigned" || a.status === "started") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.status === "assigned" ? (
            <Button
              size="sm"
              onClick={onStart}
              disabled={pending || !isToday}
              title={isToday ? undefined : "Not until the start date"}
            >
              {a.mode === "offline" ? "Start (check in)" : "Start"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onComplete}
              disabled={pending}
            >
              Mark completed
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/field/territory/${a.territoryId}`}>
              Open territory
            </Link>
          </Button>
        </div>
      ) : null}
    </article>
  );
}
