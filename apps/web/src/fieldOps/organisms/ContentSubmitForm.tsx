"use client";

import { submitFieldOpsContent } from "@/actions/fieldOps/submitFieldOpsContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsContentBrief } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Somewhere else" },
] as const;

/**
 * Sending in a post. The engagement numbers are optional and are recorded
 * as the creator's own report — nothing is paid on them, and the form says
 * so rather than implying otherwise.
 */
export default function ContentSubmitForm({
  campaignId,
  briefs,
}: {
  campaignId: string;
  briefs: FieldOpsContentBrief[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [briefId, setBriefId] = useState("");
  const [platform, setPlatform] =
    useState<(typeof PLATFORMS)[number]["value"]>("tiktok");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [shares, setShares] = useState("");

  const submit = () =>
    start(async () => {
      const num = (v: string) => (v.trim() ? Number(v) : undefined);
      const res = await submitFieldOpsContent({
        campaignId,
        briefId: briefId || null,
        platform,
        url: url.trim(),
        caption: caption.trim() || null,
        postedAt: new Date().toISOString(),
        selfReportedMetrics: {
          views: num(views),
          likes: num(likes),
          shares: num(shares),
        },
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Sent for review.");
        setOpen(false);
        setUrl("");
        setCaption("");
        setViews("");
        setLikes("");
        setShares("");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't send it.");
      }
    });

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Send in a post</Button>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-medium">Send in a post</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-brief">Against a brief (optional)</Label>
          <select
            id="c-brief"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={briefId}
            onChange={(e) => setBriefId(e.target.value)}
          >
            <option value="">Not from a brief</option>
            {briefs
              .filter((b) => b.status === "open")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-platform">Where you posted it</Label>
          <select
            id="c-platform"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as typeof platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="c-url">Link to the post</Label>
        <Input
          id="c-url"
          inputMode="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="c-caption">What it was about (optional)</Label>
        <Textarea
          id="c-caption"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div>
        <p className="text-sm font-medium">How it did (optional)</p>
        <p className="text-xs text-muted-foreground">
          Whatever the app showed you. These are recorded as your own figures
          and nothing is paid on them.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Input
            inputMode="numeric"
            placeholder="Views"
            value={views}
            onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            inputMode="numeric"
            placeholder="Likes"
            value={likes}
            onChange={(e) => setLikes(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            inputMode="numeric"
            placeholder="Shares"
            value={shares}
            onChange={(e) => setShares(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={pending || !/^https?:\/\/.{5,}/.test(url.trim())}
        >
          Send for review
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
