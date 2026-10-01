"use client";

import { upsertFieldOpsContentBrief } from "@/actions/fieldOps/upsertFieldOpsContentBrief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const PLATFORMS = [
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "youtube",
  "whatsapp",
] as const;

/** The lead writes a brief for the content creator. */
export default function ContentBriefForm({
  campaignId,
  creator,
}: {
  campaignId: string;
  creator: { id: string; name: string | null } | null;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);

  const toggle = (p: string) =>
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );

  const submit = () =>
    start(async () => {
      const res = await upsertFieldOpsContentBrief({
        campaignId,
        title: title.trim(),
        description: description.trim() || null,
        platforms,
        assignedMemberId: creator?.id ?? null,
        dueOn: dueOn || null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? t("briefAdded"));
        setOpen(false);
        setTitle("");
        setDescription("");
        setDueOn("");
        setPlatforms([]);
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSaveTheBrief"));
      }
    });

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t("addABrief")}</Button>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-medium">{t("newBrief")}</h3>
      {creator ? (
        <p className="text-sm text-muted-foreground">
          {t("goesToCreator", {
            name: creator.name ?? t("yourContentCreator"),
          })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("nobodyOnTheTeamHasThe")}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="b-title">{t("whatYouWantMade")}</Label>
        <Input
          id="b-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={150}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b-desc">{t("anythingTheyShouldKnowOptional")}</Label>
        <Textarea
          id="b-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b-due">{t("wantedByOptional")}</Label>
        <Input
          id="b-due"
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
        />
      </div>
      <div>
        <p className="text-sm font-medium">{t("whereItShouldGo")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${
                platforms.includes(p)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || title.trim().length < 3}>
          {t("addTheBrief")}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
