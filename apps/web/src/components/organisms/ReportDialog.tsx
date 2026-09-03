"use client";

import { submitReport } from "@/actions/submitReport";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/config/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  REPORTABLE_CATEGORIES,
  REPORT_CATEGORY_LABEL,
  REPORT_TARGET_LABEL,
  type ReportCategory,
  type ReportTargetType,
} from "@abonten/types/adminTypes";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  REPORT_ATTACHMENT_MIME_TYPES,
} from "@abonten/validation/reportSchema";
import { AlertTriangle, CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";

// User-facing "Report this content" flow (spec §3/§4). Works for any
// reportable entity. reporter identity is set server-side by
// submitReport -> submitReportCore; nothing here is trusted for that.
//
// Steps: pick reason -> add optional detail + attachment -> review -> submit.
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  /** short human label of what's being reported (title/name) */
  targetLabel: string;
}) {
  const { data: user } = useCurrentUser();
  const categories = REPORTABLE_CATEGORIES[targetType];

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setCategory(null);
      setDetails("");
      setFile(null);
      setError(null);
      setBusy(false);
      setDone(false);
    }
  }, [open]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!REPORT_ATTACHMENT_MIME_TYPES.includes(f.type as never)) {
      setError("Attachments must be an image or PDF.");
      return;
    }
    if (f.size > REPORT_ATTACHMENT_MAX_BYTES) {
      setError("Attachment must be under 10 MB.");
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      let attachment: {
        storagePath: string;
        fileName: string | null;
        mimeType: string | null;
        sizeBytes: number | null;
      } | null = null;

      if (file && user) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("report-attachments")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setBusy(false);
          setError("Couldn't upload that file. Try submitting without it.");
          return;
        }
        attachment = {
          storagePath: path,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
        };
      }

      const res = await submitReport({
        targetType,
        targetId,
        category,
        details: details.trim() || null,
        attachment,
      });
      setBusy(false);
      if (res.status === 200) {
        setDone(true);
      } else {
        setError(res.message ?? "Couldn't submit your report.");
      }
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  const targetWord = REPORT_TARGET_LABEL[targetType];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-11 w-11 text-mint" />
            <DialogTitle>Report submitted</DialogTitle>
            <DialogDescription>
              Thank you — our team will review this {targetWord}.
            </DialogDescription>
            <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report this {targetWord}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {targetLabel}
              </DialogDescription>
            </DialogHeader>

            {step === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Why are you reporting this?
                </p>
                <div className="flex flex-col gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        category === c
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {REPORT_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Add detail{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </p>
                  <Textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
                    placeholder="Anything that helps us understand the problem"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-primary hover:underline">
                    <Paperclip className="h-4 w-4" />
                    {file ? file.name : "Attach a screenshot or PDF (optional)"}
                    <input
                      type="file"
                      className="hidden"
                      accept={REPORT_ATTACHMENT_MIME_TYPES.join(",")}
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {file && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-muted-foreground hover:underline"
                      onClick={() => setFile(null)}
                    >
                      Remove attachment
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-2 text-sm">
                <div className="rounded-md border border-border p-3">
                  <p>
                    <span className="text-muted-foreground">Reason: </span>
                    {category ? REPORT_CATEGORY_LABEL[category] : ""}
                  </p>
                  {details.trim() && (
                    <p className="mt-1 whitespace-pre-wrap">
                      <span className="text-muted-foreground">Detail: </span>
                      {details.trim()}
                    </p>
                  )}
                  {file && (
                    <p className="mt-1 text-muted-foreground">
                      Attachment: {file.name}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitting a false report may affect your account.
                </p>
              </div>
            )}

            {error && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}
                  disabled={busy}
                >
                  Back
                </Button>
              )}
              {step < 2 ? (
                <Button
                  onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)}
                  disabled={step === 0 && !category}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={submit} disabled={busy}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Submit report
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
