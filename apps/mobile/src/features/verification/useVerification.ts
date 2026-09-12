import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  VERIFICATION_EVIDENCE_MIME_TYPES,
  type SubjectVerificationView,
  type VerificationSubjectType,
} from "@abonten/types/verificationType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// Trust & Verification on mobile (PROJECT.md §30).
//
// Unlike place claims — which run straight off the client because
// place_claim_request has claimant-scoped RLS — the verification tables
// carry NO anon/authenticated privileges at all, so every read and write
// goes through /api/mobile/verification/**. The one thing the client does
// directly is push the bytes: the API hands back a one-shot signed upload
// URL for the private bucket and the device PUTs to it.

export const VERIFICATION_KEY = (
  subjectType: VerificationSubjectType,
  subjectId: string,
) => ["mobile", "verification", subjectType, subjectId] as const;

export type StagedDoc = {
  /** Local key so the list can track it before it has a server id. */
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  evidenceType: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export function validateDoc(
  file: { mimeType: string; sizeBytes: number },
  maxBytes: number,
): string | null {
  if (!VERIFICATION_EVIDENCE_MIME_TYPES.includes(file.mimeType as never)) {
    return "Send a photo (JPG, PNG, WebP, HEIC) or a PDF.";
  }
  if (file.sizeBytes > maxBytes) {
    return `That file is larger than ${Math.round(
      maxBytes / (1024 * 1024),
    )} MB. Try a smaller photo or scan.`;
  }
  return null;
}

/** Best-effort MIME when the picker does not give one. */
export function guessMime(name: string, fallback: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return fallback;
}

export function useSubjectVerification(
  subjectType: VerificationSubjectType,
  subjectId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: VERIFICATION_KEY(subjectType, subjectId),
    enabled: (options?.enabled ?? true) && !!subjectId,
    queryFn: () => api.verification.subject({ subjectType, subjectId }),
    staleTime: 30_000,
  });
}

export function useVerificationProgram() {
  return useQuery({
    queryKey: ["mobile", "verification", "program"] as const,
    queryFn: () => api.verification.program(),
    staleTime: 5 * 60_000,
  });
}

/** Reads the view out of the query result, or null while it is loading. */
export function verificationView(
  result: { status: number; data?: SubjectVerificationView } | undefined,
): SubjectVerificationView | null {
  return result && result.status === 200 ? (result.data ?? null) : null;
}

export function useVerificationActions(
  subjectType: VerificationSubjectType,
  subjectId: string,
) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: VERIFICATION_KEY(subjectType, subjectId) });

  const start = useMutation({
    mutationFn: (input: {
      organizerType?: string | null;
      legalName?: string | null;
      applicantNote?: string | null;
    }) =>
      api.verification.start({
        subjectType,
        subjectId,
        ...input,
      } as never),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: {
      caseId: string;
      organizerType?: string | null;
      legalName?: string | null;
      applicantNote?: string | null;
    }) => {
      const { caseId, ...body } = input;
      return api.verification.update(caseId, body as never);
    },
    onSuccess: invalidate,
  });

  const submit = useMutation({
    mutationFn: (caseId: string) => api.verification.submit(caseId),
    onSuccess: invalidate,
  });

  const withdraw = useMutation({
    mutationFn: (caseId: string) => api.verification.withdraw(caseId),
    onSuccess: invalidate,
  });

  const removeEvidence = useMutation({
    mutationFn: (input: { caseId: string; evidenceId: string }) =>
      api.verification.removeEvidence(input.caseId, input.evidenceId),
    onSuccess: invalidate,
  });

  return { start, update, submit, withdraw, removeEvidence, invalidate };
}

/**
 * Uploads one staged document: ask for a ticket, then PUT the bytes into the
 * private bucket. Returns an error message, or null on success.
 *
 * `fetch(uri).arrayBuffer()` is the same byte source usePlaceClaim.ts uses —
 * React Native's fetch handles file:// and content:// URIs.
 */
export async function uploadVerificationDoc(
  caseId: string,
  doc: StagedDoc,
): Promise<string | null> {
  const ticket = await api.verification.requestEvidenceUpload(caseId, {
    evidenceType: doc.evidenceType,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    fileName: doc.name,
  });
  if (ticket.status !== 200 || !ticket.data) {
    return ticket.message ?? "Could not start the upload.";
  }

  let bytes: ArrayBuffer;
  try {
    const res = await fetch(doc.uri);
    bytes = await res.arrayBuffer();
  } catch {
    return "Could not read that file.";
  }

  const { error } = await supabase.storage
    .from(ticket.data.bucket)
    .uploadToSignedUrl(ticket.data.path, ticket.data.token, bytes, {
      contentType: doc.mimeType,
    });
  if (error) return "Upload failed. Try again.";
  return null;
}

/** Per-file staging list with retry, shared by the two verification screens. */
export function useStagedDocs() {
  const [docs, setDocs] = useState<StagedDoc[]>([]);

  const add = (doc: StagedDoc) => setDocs((prev) => [...prev, doc]);
  const remove = (key: string) =>
    setDocs((prev) => prev.filter((d) => d.key !== key));
  const patch = (key: string, patchValue: Partial<StagedDoc>) =>
    setDocs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patchValue } : d)),
    );
  const clearDone = () =>
    setDocs((prev) => prev.filter((d) => d.status !== "done"));

  return { docs, setDocs, add, remove, patch, clearDone };
}
