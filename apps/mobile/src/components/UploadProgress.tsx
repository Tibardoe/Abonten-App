import type { UploadProgressState } from "@/features/uploads/useUploadProgress";
import { ProgressBar } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// The one visual for an in-flight upload. Reads its labels straight off the
// phase, so what the bar says is always what is actually happening — never a
// fake percentage while the server works, and never a stalled 100%.

const LABEL: Record<string, string> = {
  preparing: "preparingYourFile",
  uploading: "uploading5",
  saving: "almostThereSaving",
};

export function UploadProgress({
  state,
  /** Names the thing being uploaded, e.g. "flyer" -> "Uploading flyer". */
  what,
  className,
}: {
  state: UploadProgressState;
  what?: string;
  className?: string;
}) {
  const t = useTranslations("common");

  if (!state.busy) return null;

  const base = LABEL[state.phase] ? t(LABEL[state.phase]) : t("working");
  const label =
    state.phase === "uploading" && what
      ? t("uploading4", { what: what })
      : base;

  return (
    <View className={className}>
      <ProgressBar
        label={label}
        value={state.fraction}
        showPercent={state.phase === "uploading"}
        indeterminate={state.phase !== "uploading"}
      />
    </View>
  );
}
