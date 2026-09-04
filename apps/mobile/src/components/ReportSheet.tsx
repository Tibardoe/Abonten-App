import { useSession } from "@/auth/SessionProvider";
import { useSubmitReport } from "@/features/reports/useSubmitReport";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import type { SubmitReportBody } from "@abonten/api-client";
import {
  REPORTABLE_CATEGORIES,
  REPORT_CATEGORY_LABEL,
  REPORT_TARGET_LABEL,
  type ReportTargetType,
} from "@abonten/types/adminTypes";
import {
  AppText,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  Sheet,
} from "@abonten/ui-native";
import {
  REPORT_ATTACHMENT_MAX_BYTES,
  REPORT_ATTACHMENT_MIME_TYPES,
} from "@abonten/validation/reportSchema";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

// Generic "Report this content" sheet — replaces the place-only ReportSheet.
// Works for any reportable entity; the reason chips are the categories that
// make sense for that target (REPORTABLE_CATEGORIES). Submits through
// POST /api/mobile/reports; the reporter identity is server-derived.
//
// An optional single screenshot / PDF can be attached — uploaded to the
// private `report-attachments` bucket at <uid>/<uuid>.<ext> (storage RLS
// keys on the first path segment), exactly like the web ReportDialog and
// the place-claim document flow.

const REPORT_BUCKET = "report-attachments";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

type PickedAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
};

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** short human description of what's being reported, e.g. the event title */
  label: string;
}) {
  const { session } = useSession();
  const categories = REPORTABLE_CATEGORIES[targetType];
  const [category, setCategory] = useState<SubmitReportBody["category"] | null>(
    null,
  );
  const [detail, setDetail] = useState("");
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useSubmitReport();

  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setDetail("");
    setAttachment(null);
    setUploading(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  async function pickAttachment() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    const name = a.name ?? `attachment-${Date.now()}`;
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    const mimeType =
      a.mimeType && a.mimeType !== "application/octet-stream"
        ? a.mimeType
        : ext === "pdf"
          ? "application/pdf"
          : ext === "png"
            ? "image/png"
            : "image/jpeg";

    if (
      !(REPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)
    ) {
      setError("Attach a JPG, PNG, WebP or PDF file.");
      return;
    }
    if (typeof a.size === "number" && a.size > REPORT_ATTACHMENT_MAX_BYTES) {
      setError("That file is over 10 MB. Attach a smaller one.");
      return;
    }
    setAttachment({
      uri: a.uri,
      name,
      mimeType,
      sizeBytes: typeof a.size === "number" ? a.size : null,
    });
  }

  async function uploadAttachment(
    userId: string,
    file: PickedAttachment,
  ): Promise<SubmitReportBody["attachment"]> {
    const ext =
      (file.name.includes(".") ? file.name.split(".").pop() : null) ||
      EXT_BY_MIME[file.mimeType] ||
      "bin";
    const path = `${userId}/${uuidv4()}.${ext.toLowerCase()}`;
    // fetch on a file:// URI is the supported Expo path to bytes for
    // supabase-js (no extra base64 dependency).
    const res = await fetch(file.uri);
    const bytes = await res.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(REPORT_BUCKET)
      .upload(path, bytes, { contentType: file.mimeType, upsert: false });
    if (upErr) throw upErr;
    return {
      storagePath: path,
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  }

  async function submit() {
    setError(null);
    if (!category) {
      setError("Pick a reason.");
      return;
    }

    let uploaded: SubmitReportBody["attachment"] = null;
    if (attachment) {
      const userId = session?.user.id;
      if (!userId) {
        setError("Sign in to attach a file.");
        return;
      }
      setUploading(true);
      try {
        uploaded = await uploadAttachment(userId, attachment);
      } catch {
        setUploading(false);
        setError("Couldn't upload that file. Try submitting without it.");
        return;
      }
      setUploading(false);
    }

    report.mutate(
      {
        targetType,
        targetId,
        category,
        details: detail.trim() ? detail.trim() : null,
        attachment: uploaded,
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Something went wrong."),
      },
    );
  }

  const busy = uploading || report.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Report this ${REPORT_TARGET_LABEL[targetType]}`}
      footer={
        submitted ? (
          <Button title="Done" onPress={onClose} />
        ) : (
          <Button
            title={
              uploading
                ? "Uploading…"
                : report.isPending
                  ? "Submitting…"
                  : "Submit report"
            }
            onPress={submit}
            disabled={busy}
          />
        )
      }
    >
      {submitted ? (
        <View className="items-center gap-3 py-4">
          <Icon name="checkmark-circle" size={44} tone="success" />
          <AppText variant="bodyStrong" className="text-center">
            Report submitted
          </AppText>
          <AppText variant="muted" className="text-center">
            Thanks — our team will take a look.
          </AppText>
        </View>
      ) : (
        <View className="gap-4">
          <AppText variant="muted" numberOfLines={2}>
            {label}
          </AppText>

          <View className="gap-2">
            <AppText variant="label">Reason</AppText>
            <View className="flex-row flex-wrap gap-2">
              {categories.map((c) => (
                <Chip
                  key={c}
                  label={REPORT_CATEGORY_LABEL[c]}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>

          <Field label="Anything else? (optional)">
            <Input
              value={detail}
              onChangeText={setDetail}
              placeholder="Add any detail that helps"
              multiline
              numberOfLines={3}
              maxLength={2000}
              style={{ minHeight: 72, textAlignVertical: "top" }}
            />
          </Field>

          <View className="gap-2">
            <AppText variant="label">Evidence (optional)</AppText>
            {attachment ? (
              <View className="flex-row items-center gap-2 rounded-xl border border-border p-3">
                <Icon
                  name={
                    attachment.mimeType === "application/pdf"
                      ? "document-text-outline"
                      : "image-outline"
                  }
                  size={20}
                />
                <AppText variant="small" className="flex-1" numberOfLines={1}>
                  {attachment.name}
                </AppText>
                <Pressable
                  onPress={() => setAttachment(null)}
                  hitSlop={8}
                  disabled={busy}
                >
                  <Icon name="close" size={18} tone="muted" />
                </Pressable>
              </View>
            ) : (
              <Button
                title="Attach a screenshot or PDF"
                variant="outline"
                size="sm"
                leftIcon="attach"
                onPress={pickAttachment}
                disabled={busy}
              />
            )}
          </View>

          {error ? (
            <AppText variant="small" tone="error">
              {error}
            </AppText>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
