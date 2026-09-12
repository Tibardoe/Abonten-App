"use client";

import { removeVerificationEvidence } from "@/actions/verification/removeVerificationEvidence";
import { requestVerificationEvidenceUpload } from "@/actions/verification/requestVerificationEvidenceUpload";
import { supabase } from "@/config/supabase/client";
import { useToast } from "@/hooks/useToast";
import {
  VERIFICATION_EVIDENCE_MIME_TYPES,
  type VerificationEvidenceSummary,
  type VerificationEvidenceType,
} from "@abonten/types/verificationType";
import { useRef, useState } from "react";
import {
  IoCheckmarkCircle,
  IoCloudUploadOutline,
  IoDocumentTextOutline,
  IoRefreshOutline,
  IoTrashOutline,
  IoWarningOutline,
} from "react-icons/io5";

// Document uploader for a verification request.
//
// The bytes never pass through our server: the action mints a one-shot
// signed upload URL for the private bucket and the browser PUTs straight to
// storage. Each file carries its own status so one failure never blocks the
// rest — the owner retries just that row.

type Staged = {
  key: string;
  file: File;
  evidenceType: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const ACCEPT = VERIFICATION_EVIDENCE_MIME_TYPES.join(",");

function readableSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function VerificationEvidenceUploader({
  caseId,
  evidenceTypes,
  existing,
  maxFiles,
  maxFileBytes,
  disabled,
  onChanged,
}: {
  caseId: string;
  evidenceTypes: VerificationEvidenceType[];
  existing: VerificationEvidenceSummary[];
  maxFiles: number;
  maxFileBytes: number;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [evidenceType, setEvidenceType] = useState(
    evidenceTypes[0]?.key ?? "other",
  );
  const [busy, setBusy] = useState(false);

  const total = existing.length + staged.filter((s) => s.status !== "error").length;
  const full = total >= maxFiles;

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = maxFiles - total;
    if (room <= 0) {
      toast.error(`You can attach at most ${maxFiles} documents.`);
      return;
    }
    const next: Staged[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (file.size > maxFileBytes) {
        toast.error(
          `${file.name} is larger than ${Math.round(
            maxFileBytes / (1024 * 1024),
          )} MB. Try a smaller photo or scan.`,
        );
        continue;
      }
      if (!VERIFICATION_EVIDENCE_MIME_TYPES.includes(file.type as never)) {
        toast.error(`${file.name} must be a photo or a PDF.`);
        continue;
      }
      next.push({
        key: `${file.name}-${file.size}-${Date.now()}-${next.length}`,
        file,
        evidenceType,
        status: "queued",
      });
    }
    if (next.length > 0) setStaged((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadOne(item: Staged): Promise<boolean> {
    setStaged((prev) =>
      prev.map((s) =>
        s.key === item.key ? { ...s, status: "uploading", error: undefined } : s,
      ),
    );

    const ticket = await requestVerificationEvidenceUpload({
      caseId,
      evidenceType: item.evidenceType,
      mimeType: item.file.type,
      sizeBytes: item.file.size,
      fileName: item.file.name,
    });

    if (ticket.status !== 200 || !ticket.data) {
      setStaged((prev) =>
        prev.map((s) =>
          s.key === item.key
            ? {
                ...s,
                status: "error",
                error: ticket.message ?? "Could not start the upload.",
              }
            : s,
        ),
      );
      return false;
    }

    const { error } = await supabase.storage
      .from(ticket.data.bucket)
      .uploadToSignedUrl(ticket.data.path, ticket.data.token, item.file, {
        contentType: item.file.type,
      });

    if (error) {
      setStaged((prev) =>
        prev.map((s) =>
          s.key === item.key
            ? { ...s, status: "error", error: "Upload failed. Try again." }
            : s,
        ),
      );
      return false;
    }

    setStaged((prev) =>
      prev.map((s) => (s.key === item.key ? { ...s, status: "done" } : s)),
    );
    return true;
  }

  async function uploadAll() {
    setBusy(true);
    let anyOk = false;
    for (const item of staged) {
      if (item.status === "done") continue;
      const ok = await uploadOne(item);
      anyOk = anyOk || ok;
    }
    setBusy(false);
    if (anyOk) {
      setStaged((prev) => prev.filter((s) => s.status !== "done"));
      onChanged();
      toast.success("Document added.");
    }
  }

  async function remove(evidenceId: string) {
    setBusy(true);
    const res = await removeVerificationEvidence({ caseId, evidenceId });
    setBusy(false);
    if (res.status === 200) {
      onChanged();
      toast.success("Document removed.");
    } else {
      toast.error(res.message ?? "Could not remove the document.");
    }
  }

  return (
    <div className="space-y-4">
      {existing.length > 0 ? (
        <ul className="space-y-2">
          {existing.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <IoDocumentTextOutline
                  aria-hidden
                  className="shrink-0 text-xl text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.evidenceTypeLabel ?? d.evidenceType}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.fileName ?? "Document"} · {readableSize(d.sizeBytes)}
                  </p>
                </div>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  disabled={busy}
                  aria-label={`Remove ${d.fileName ?? "document"}`}
                  className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                >
                  <IoTrashOutline className="text-lg" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {staged.length > 0 ? (
        <ul className="space-y-2">
          {staged.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.file.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {readableSize(s.file.size)} ·{" "}
                  {s.status === "queued"
                    ? "Ready to send"
                    : s.status === "uploading"
                      ? "Sending…"
                      : s.status === "done"
                        ? "Sent"
                        : (s.error ?? "Failed")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {s.status === "done" ? (
                  <IoCheckmarkCircle aria-hidden className="text-lg text-mint" />
                ) : null}
                {s.status === "error" ? (
                  <>
                    <IoWarningOutline
                      aria-hidden
                      className="text-lg text-destructive"
                    />
                    <button
                      type="button"
                      onClick={() => uploadOne(s)}
                      disabled={busy}
                      aria-label={`Retry ${s.file.name}`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <IoRefreshOutline className="text-lg" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setStaged((prev) => prev.filter((x) => x.key !== s.key))
                  }
                  disabled={busy || s.status === "uploading"}
                  aria-label={`Remove ${s.file.name}`}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                >
                  <IoTrashOutline className="text-lg" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="space-y-1">
            <label
              htmlFor="evidence-type"
              className="text-sm font-medium"
            >
              What are you sending?
            </label>
            <select
              id="evidence-type"
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            >
              {evidenceTypes.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {evidenceTypes.find((t) => t.key === evidenceType)?.description ??
                ""}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || full}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <IoCloudUploadOutline className="text-lg" />
              Choose file
            </button>

            {staged.some((s) => s.status !== "done") ? (
              <button
                type="button"
                onClick={uploadAll}
                disabled={busy}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Add to request"}
              </button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Photos or PDF, up to {Math.round(maxFileBytes / (1024 * 1024))} MB
            each, {maxFiles} documents in total.
            {full ? " You have reached the limit." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
