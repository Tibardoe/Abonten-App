import { View } from "react-native";
import { Button } from "./Button";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";

// Native echo of the web NoEventsFound / NoEventsInLocation family: an icon,
// a heading, a description, and an optional call to action — instead of the
// single centered <Text> the screens use now. Copy should match the web
// wording for the equivalent state.

export type EmptyStateProps = {
  icon?: IoniconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon = "sparkles-outline",
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View
      className={["items-center gap-2 px-8 py-16", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon name={icon} size={28} tone="muted" />
      <AppText variant="sectionTitle" className="mt-1 text-center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="muted" className="text-center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          variant="primary"
          size="sm"
          className="mt-3"
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}
