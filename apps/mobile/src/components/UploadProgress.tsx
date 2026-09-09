import type { UploadProgressState } from "@/features/uploads/useUploadProgress";
import { ProgressBar } from "@abonten/ui-native";
import { View } from "react-native";

// The one visual for an in-flight upload. Reads its labels straight off the
// phase, so what the bar says is always what is actually happening — never a
// fake percentage while the server works, and never a stalled 100%.

const LABEL: Record<string, string> = {
  preparing: "Preparing your file…",
  uploading: "Uploading",
  saving: "Almost there — saving…",
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
  if (!state.busy) return null;

  const base = LABEL[state.phase] ?? "Working…";
  const label =
    state.phase === "uploading" && what ? `Uploading ${what}` : base;

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
