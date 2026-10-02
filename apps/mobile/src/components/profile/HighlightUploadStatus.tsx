import { useHighlightUpload } from "@/features/profile/HighlightUploadProvider";
import { formatPercent } from "@abonten/core/i18n/format";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

// Compact banner for an in-flight / failed highlight upload, shown on the
// highlights row after the compose screen hands off and closes. Native echo
// of the web `HighlightUploadStatus`.

export function HighlightUploadStatus() {
  const { locale } = useLocale();
  const t = useTranslations("profile");

  const { status, progress, count, error, retry, dismiss } =
    useHighlightUpload();

  if (status === "idle") return null;

  const pct = Math.round(progress * 100);
  const label = t("items", { count: count });

  if (status === "success") {
    return (
      <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Icon name="checkmark-circle" size={16} tone="primary" />
        <AppText variant="small">{t("highlightPosted")}</AppText>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View className="mb-2 gap-2 rounded-xl border border-destructive/40 bg-card px-3 py-2.5">
        <View className="flex-row items-center gap-2">
          <Icon name="alert-circle" size={16} tone="destructive" />
          <AppText variant="small" className="flex-1">
            {error ?? t("couldnTPostYourHighlight")}
          </AppText>
        </View>
        <View className="flex-row gap-3">
          <Pressable accessibilityRole="button" onPress={retry} hitSlop={6}>
            <AppText variant="small" tone="brand" className="font-semibold">
              {t("retry")}
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={6}>
            <AppText variant="muted" className="font-semibold">
              {t("dismiss")}
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // uploading
  return (
    <View className="mb-2 gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <View className="flex-row items-center justify-between">
        <AppText variant="small">
          {t("postingHighlight", { label: label })}
        </AppText>
        <AppText variant="meta">{formatPercent(pct, locale)}</AppText>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </View>
    </View>
  );
}
