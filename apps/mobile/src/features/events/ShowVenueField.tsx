import type { ShowVenueBody } from "@abonten/api-client";
import { AppText, Chip } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";
import { VenuePickerField } from "./VenuePickerField";

/** Where new shows are: the listing's own venue, or another one (a tour). */
export type ShowVenueState =
  | { mode: "same" }
  | { mode: "other"; venue: ShowVenueBody | null; label: string | null };

/**
 * Shows and copies: "At this venue" or "At another venue" (a tour,
 * docs/architecture/show-runs.md). Mirrors the website's ShowVenueChooser.
 */
export function ShowVenueField({
  value,
  onChange,
}: {
  value: ShowVenueState;
  onChange: (next: ShowVenueState) => void;
}) {
  const t = useTranslations("events");
  const other = value.mode === "other";

  const choose = (mode: "same" | "other") => {
    if (mode === value.mode) return;
    onChange(mode === "same" ? { mode } : { mode, venue: null, label: null });
  };

  return (
    <View className="gap-2">
      <AppText variant="small" className="font-semibold">
        {t("showVenue")}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          label={t("showVenueSame")}
          selected={!other}
          onPress={() => choose("same")}
        />
        <Chip
          label={t("showVenueOther")}
          selected={other}
          onPress={() => choose("other")}
        />
      </View>
      <AppText variant="caption" tone="muted">
        {t("showVenueHint")}
      </AppText>

      {value.mode === "other" ? (
        <VenuePickerField
          picked={
            value.venue && value.label
              ? { venue: value.venue, label: value.label }
              : null
          }
          onChange={(next) =>
            onChange({
              mode: "other",
              venue: next?.venue ?? null,
              label: next?.label ?? null,
            })
          }
        />
      ) : null}
    </View>
  );
}
