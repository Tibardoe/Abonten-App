import { useSubmitReport } from "@/features/reports/useSubmitReport";
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
import { useEffect, useState } from "react";
import { View } from "react-native";

// Generic "Report this content" sheet — replaces the place-only ReportSheet.
// Works for any reportable entity; the reason chips are the categories that
// make sense for that target (REPORTABLE_CATEGORIES). Submits through
// POST /api/mobile/reports; the reporter identity is server-derived.
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
  const categories = REPORTABLE_CATEGORIES[targetType];
  const [category, setCategory] = useState<SubmitReportBody["category"] | null>(
    null,
  );
  const [detail, setDetail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useSubmitReport();

  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setDetail("");
    setSubmitted(false);
    setError(null);
  }, [open]);

  function submit() {
    setError(null);
    if (!category) {
      setError("Pick a reason.");
      return;
    }
    report.mutate(
      {
        targetType,
        targetId,
        category,
        details: detail.trim() ? detail.trim() : null,
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Something went wrong."),
      },
    );
  }

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
            title={report.isPending ? "Submitting…" : "Submit report"}
            onPress={submit}
            disabled={report.isPending}
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
