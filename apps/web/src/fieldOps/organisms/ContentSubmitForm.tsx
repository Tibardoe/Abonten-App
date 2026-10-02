"use client";

import { submitFieldOpsContent } from "@/actions/fieldOps/submitFieldOpsContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { FieldOpsContentBrief } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: null },
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
  const t = useTranslations("fieldOps");

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
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("sentForReview"));
        setOpen(false);
        setUrl("");
        setCaption("");
        setViews("");
        setLikes("");
        setShares("");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSendIt"));
      }
    });

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t("sendInAPost")}</Button>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-medium">{t("sendInAPost")}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-brief">{t("againstABriefOptional")}</Label>
          <select
            id="c-brief"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={briefId}
            onChange={(e) => setBriefId(e.target.value)}
          >
            <option value="">{t("notFromABrief")}</option>
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
          <Label htmlFor="c-platform">{t("whereYouPostedIt")}</Label>
          <select
            id="c-platform"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as typeof platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label ?? t("somewhereElse")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="c-url">{t("linkToThePost")}</Label>
        <Input
          id="c-url"
          inputMode="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="c-caption">{t("whatItWasAboutOptional")}</Label>
        <Textarea
          id="c-caption"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div>
        <p className="text-sm font-medium">{t("howItDidOptional")}</p>
        <p className="text-xs text-muted-foreground">
          {t("whateverTheAppShowedYouThese")}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Input
            inputMode="numeric"
            placeholder={t("views2")}
            value={views}
            onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            inputMode="numeric"
            placeholder={t("likes2")}
            value={likes}
            onChange={(e) => setLikes(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            inputMode="numeric"
            placeholder={t("shares2")}
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
          {t("sendForReview")}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
