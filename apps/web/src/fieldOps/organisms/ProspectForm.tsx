"use client";

import { createFieldOpsProspect } from "@/actions/fieldOps/createFieldOpsProspect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** "Add a business": logs a prospect in the territory the member is on. */
export default function ProspectForm({
  campaignId,
  territoryId,
}: {
  campaignId: string;
  territoryId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"place" | "event" | "organizer">("place");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("in_person");
  const [notes, setNotes] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createFieldOpsProspect({
        campaignId,
        territoryId,
        kind,
        name,
        contactName: contactName || null,
        contactPhoneE164: phone ? `+${phone.replace(/\D/g, "")}` : null,
        contactChannel: channel,
        notes: notes || null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Saved.");
        setName("");
        setContactName("");
        setPhone("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't save that.");
      }
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full md:w-auto">
        Add a business
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-kind">What is it?</Label>
          <Select
            id="prospect-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="place">A business / place</option>
            <option value="event">An event</option>
            <option value="organizer">An event organizer</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-name">Name</Label>
          <Input
            id="prospect-name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Auntie Ama's Chop Bar"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-contact">Who did you speak to?</Label>
          <Input
            id="prospect-contact"
            maxLength={120}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-phone">Their phone (international)</Label>
          <Input
            id="prospect-phone"
            inputMode="tel"
            placeholder="+233241234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-channel">How</Label>
          <Select
            id="prospect-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="in_person">In person</option>
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="social">Social media</option>
            <option value="email">Email</option>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="prospect-notes">Notes</Label>
        <Textarea
          id="prospect-notes"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
