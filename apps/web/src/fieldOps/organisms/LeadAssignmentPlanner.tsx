"use client";

import { cancelFieldOpsAssignment } from "@/actions/fieldOps/cancelFieldOpsAssignment";
import { createFieldOpsAssignment } from "@/actions/fieldOps/createFieldOpsAssignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { formatDistance } from "@/fieldOps/lib/formatDistance";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type {
  FieldOpsAssignment,
  FieldOpsLeadDashboard,
  FieldOpsTerritory,
} from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The lead's planning screen: a day picker, the assignments covering that
 * day, a create form (member × territory × dates) and cancel-with-reason.
 */
export default function LeadAssignmentPlanner({
  campaignId,
  date,
  today,
  assignments,
  members,
  territories,
  canPlan,
}: {
  campaignId: string;
  date: string;
  today: string;
  assignments: FieldOpsAssignment[];
  members: FieldOpsLeadDashboard["assignableMembers"];
  territories: FieldOpsTerritory[];
  canPlan: boolean;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [territoryId, setTerritoryId] = useState(
    territories.find((t) => t.status === "active")?.id ?? "",
  );
  const [startsOn, setStartsOn] = useState(date);
  const [endsOn, setEndsOn] = useState(date);
  const [notes, setNotes] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createFieldOpsAssignment({
        campaignId,
        memberId,
        territoryId,
        startsOn,
        endsOn,
        notes: notes || null,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("assigned"));
        setNotes("");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTAssignThat"));
      }
    });
  };

  const cancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelId) return;
    start(async () => {
      const res = await cancelFieldOpsAssignment({
        campaignId,
        assignmentId: cancelId,
        reason,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("cancelled2"));
        setCancelId(null);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTCancelThat"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = (
            e.currentTarget.elements.namedItem("day") as HTMLInputElement
          ).value;
          router.push(`/field/lead/assignments?date=${value}`);
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="day">{t("day")}</Label>
          <Input id="day" name="day" type="date" defaultValue={date} />
        </div>
        <Button type="submit" variant="outline">
          {t("show")}
        </Button>
        {date !== today ? (
          <Button asChild variant="ghost">
            <Link href="/field/lead/assignments">{t("today")}</Link>
          </Button>
        ) : null}
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {date === today ? t("today") : date} ({assignments.length})
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("nobodyIsAssignedOnThisDay")}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">
                      {a.memberName ?? t("member")}
                    </span>{" "}
                    · {a.territoryName} ·{" "}
                    {a.mode === "offline" ? t("inPerson") : t("online")}
                    {a.startsOn !== a.endsOn
                      ? ` · ${a.startsOn} → ${a.endsOn}`
                      : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusChip status={a.status} />
                    {canPlan &&
                    (a.status === "assigned" || a.status === "started") &&
                    cancelId !== a.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelId(a.id)}
                      >
                        {t("cancel")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {a.status === "started" && a.startDistanceM !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {t("checkedInFromTheCentre", {
                      formatDistance: formatDistance(a.startDistanceM),
                    })}
                    {a.startAccuracyM !== null
                      ? ` (±${a.startAccuracyM} m)`
                      : ""}
                    .
                  </p>
                ) : null}
                {a.cancelReason ? (
                  <p className="text-xs text-muted-foreground">
                    {t("cancelled", { cancelReason: a.cancelReason })}
                  </p>
                ) : null}
                {cancelId === a.id ? (
                  <form onSubmit={cancel} className="flex flex-wrap gap-2">
                    <Input
                      required
                      minLength={3}
                      maxLength={1000}
                      placeholder={t("whyTheMemberSeesThis")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="max-w-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                    >
                      {t("cancelAssignment")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCancelId(null)}
                    >
                      {t("keepIt")}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canPlan ? (
        <form
          onSubmit={create}
          className="flex flex-col gap-3 rounded-xl border p-4"
        >
          <h2 className="text-lg font-semibold">{t("newAssignment")}</h2>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("addActiveFieldMembersToYour")}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-member">{t("member")}</Label>
              <Select
                id="a-member"
                required
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.id} ·{" "}
                    {m.role === "offline_member" ? t("inPerson") : t("online")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-territory">{t("territory")}</Label>
              <Select
                id="a-territory"
                required
                value={territoryId}
                onChange={(e) => setTerritoryId(e.target.value)}
              >
                {territories
                  .filter((t) => t.status === "active")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-start">{t("from")}</Label>
              <Input
                id="a-start"
                type="date"
                required
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value);
                  if (endsOn < e.target.value) setEndsOn(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="a-end">{t("to")}</Label>
              <Input
                id="a-end"
                type="date"
                required
                min={startsOn}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-notes">{t("notesForTheMember")}</Label>
            <Input
              id="a-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <Button
              type="submit"
              disabled={pending || !memberId || !territoryId}
            >
              {t("assign")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
