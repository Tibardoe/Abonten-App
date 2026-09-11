"use client";

import { sendFieldOpsAnnouncement } from "@/actions/fieldOps/sendFieldOpsAnnouncement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useState, useTransition } from "react";

/** One notification (+ push) to every active member of the lead's team. */
export default function AnnouncementForm({
  campaignId,
}: { campaignId: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await sendFieldOpsAnnouncement({ campaignId, title, body });
      if (res.status === 200) {
        toast.success(res.message ?? "Sent.");
        setTitle("");
        setBody("");
      } else {
        toast.error(res.message ?? "Couldn't send that.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="ann-title">Title</Label>
        <Input
          id="ann-title"
          required
          minLength={3}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Meet at the lorry station at 8am"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ann-body">Message</Label>
        <Textarea
          id="ann-body"
          required
          minLength={3}
          maxLength={1000}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          Send to the team
        </Button>
      </div>
    </form>
  );
}
