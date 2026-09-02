import { useReportPlace } from "@/features/places/useReportPlace";
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

const PLACE_REASONS = [
  "Inaccurate information",
  "Permanently closed / doesn't exist",
  "Spam or fake listing",
  "Offensive or inappropriate",
  "Other",
];
const REVIEW_REASONS = [
  "Spam or fake",
  "Offensive language",
  "Not about this place",
  "Personal / private information",
  "Other",
];

// Report a place or one of its reviews. `reason` is the picked category plus
// any free-text detail, joined — the same free-text `reason` column the web
// reportPlace / reportPlaceReview actions write. Only an admin sees reports.
export function ReportSheet({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target:
    | { kind: "place"; placeId: string; label: string }
    | { kind: "review"; reviewId: string; label: string };
}) {
  const reasons = target.kind === "place" ? PLACE_REASONS : REVIEW_REASONS;
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useReportPlace();

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetail("");
    setSubmitted(false);
    setError(null);
  }, [open]);

  function submit() {
    setError(null);
    if (!reason) {
      setError("Pick a reason.");
      return;
    }
    const full = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    report.mutate(
      target.kind === "place"
        ? { placeId: target.placeId, reason: full }
        : { reviewId: target.reviewId, reason: full },
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
      title={target.kind === "place" ? "Report this place" : "Report review"}
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
            {target.label}
          </AppText>

          <View className="gap-2">
            <AppText variant="label">Reason</AppText>
            <View className="flex-row flex-wrap gap-2">
              {reasons.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  selected={reason === r}
                  onPress={() => setReason(r)}
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
              maxLength={500}
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
