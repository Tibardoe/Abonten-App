import { formatClockTime } from "@abonten/core/computePlaceOpenStatus";
import {
  type PlaceSpecialHourRow,
  formatSpecialDate,
} from "@abonten/core/placeSpecialHours";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

// Special dates of a place's hours (place_special_hours, PROJECT.md §90):
// one row per date, its name if any, and "Closed" or its own hours. Used
// on the public place screen (read only) and in the owner's editor (with
// a remove button). A date is a day of the place's own calendar, so it is
// written as that day in UTC: it never moves to the day before or after
// on a phone in another zone.

export function PlaceSpecialHoursList({
  rows,
  today,
  onRemove,
  removingId,
}: {
  rows: readonly PlaceSpecialHourRow[];
  /** Today's date at the place ("yyyy-mm-dd"), to mark it. */
  today?: string;
  /** The owner's editor: remove one date. */
  onRemove?: (row: PlaceSpecialHourRow) => void;
  removingId?: string | null;
}) {
  const t = useTranslations("places");
  const { locale } = useLocale();

  return (
    <View className="rounded-xl border border-border bg-card">
      {rows.map((row, i) => {
        const date = formatSpecialDate(row.special_date, locale);
        const hours =
          row.is_closed || !row.open_time || !row.close_time
            ? t("closed")
            : `${formatClockTime(row.open_time, locale)} – ${formatClockTime(row.close_time, locale)}`;
        const isToday = today != null && row.special_date === today;
        return (
          <View
            key={row.id ?? row.special_date}
            className={`flex-row items-center justify-between gap-3 px-4 py-2.5 ${
              i < rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <AppText
                  variant="small"
                  className={isToday ? "font-semibold" : undefined}
                >
                  {date}
                </AppText>
                {isToday ? (
                  <AppText variant="caption" tone="brand">
                    {t("today")}
                  </AppText>
                ) : null}
              </View>
              {row.label ? (
                <AppText variant="caption" tone="muted">
                  {row.label}
                </AppText>
              ) : null}
            </View>
            <AppText variant="muted">{hours}</AppText>
            {onRemove ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("removeSpecialDate", { date })}
                disabled={removingId === row.id}
                onPress={() => onRemove(row)}
                hitSlop={8}
                className="p-1 active:opacity-60"
              >
                <Icon name="trash-outline" size={18} tone="destructive" />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
