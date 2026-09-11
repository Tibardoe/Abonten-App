"use client";

import { updateFieldOpsProspect } from "@/actions/fieldOps/updateFieldOpsProspect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import StartOnboardingButton from "@/fieldOps/molecules/StartOnboardingButton";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsProspect } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const KIND_LABEL: Record<FieldOpsProspect["kind"], string> = {
  place: "Business",
  event: "Event",
  organizer: "Organizer",
};

/**
 * One logged business with its contact history. The member who logged it
 * can record another contact attempt; the outcome moves the status.
 */
export default function ProspectRow({
  prospect,
  editable,
}: {
  prospect: FieldOpsProspect;
  editable: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [logging, setLogging] = useState(false);
  const [pending, start] = useTransition();
  const [channel, setChannel] = useState("in_person");
  const [outcome, setOutcome] = useState("call_back");
  const [note, setNote] = useState("");
  const p = prospect;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateFieldOpsProspect({
        campaignId: p.campaignId,
        prospectId: p.id,
        contactAttempt: { channel, outcome, note: note || null },
      });
      if (res.status === 200) {
        toast.success("Logged.");
        setLogging(false);
        setNote("");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't log that.");
      }
    });
  };

  return (
    <li className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="text-sm text-muted-foreground">
            {KIND_LABEL[p.kind]}
            {p.contactName ? ` · ${p.contactName}` : ""}
            {p.contactPhoneMasked ? ` · ${p.contactPhoneMasked}` : ""}
            {p.memberName ? ` · logged by ${p.memberName}` : ""}
          </p>
        </div>
        <StatusChip status={p.status} />
      </div>
      {p.notes ? <p className="mt-2 text-sm">{p.notes}</p> : null}
      {p.contactAttempts.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {p.contactAttempts.slice(-3).map((c) => (
            <li key={c.at}>
              {new Date(c.at).toLocaleDateString()} ·{" "}
              {c.channel.replace("_", " ")} · {c.outcome.replace("_", " ")}
              {c.note ? ` — ${c.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {editable &&
      p.status !== "converted" &&
      p.kind === "place" &&
      !logging ? (
        <div className="mt-3">
          <StartOnboardingButton
            campaignId={p.campaignId}
            territoryId={p.territoryId}
            prospectId={p.id}
          />
        </div>
      ) : null}
      {editable && p.status !== "converted" ? (
        logging ? (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
            <div className="grid gap-2 md:grid-cols-3">
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="in_person">In person</option>
                <option value="phone">Phone call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="social">Social media</option>
                <option value="email">Email</option>
              </Select>
              <Select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="call_back">Call back later</option>
                <option value="no_answer">No answer</option>
                <option value="interested">Interested</option>
                <option value="declined">Not interested</option>
                <option value="other">Other</option>
              </Select>
              <Input
                placeholder="Note (optional)"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Log contact
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLogging(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setLogging(true)}
          >
            Log a contact
          </Button>
        )
      ) : null}
    </li>
  );
}
