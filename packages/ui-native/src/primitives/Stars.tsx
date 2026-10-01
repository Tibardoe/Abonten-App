import { View } from "react-native";
import { useTranslations } from "../i18n";
import { Icon } from "./Icon";

// A 0–5 star rating display — the native echo of the web StarRatingDisplay /
// the inline `★` spans scattered across the event, place and profile
// screens. Read-only; the review form's editable star input stays its own
// component. Filled stars use the Abonten brand accent (theme `primary`),
// matching the web `text-primary` stars — never an amber/gold.

export function Stars({
  rating,
  size = 14,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const t = useTranslations("common");

  const filled = Math.round(rating);
  return (
    <View
      className={["flex-row", className ?? ""].filter(Boolean).join(" ")}
      accessibilityLabel={t("outOf5Stars", { rating: rating })}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name={n <= filled ? "star" : "star-outline"}
          size={size}
          tone={n <= filled ? "primary" : "muted"}
        />
      ))}
    </View>
  );
}
