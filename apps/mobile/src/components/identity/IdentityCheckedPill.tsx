import {
  identityBadgeExplanation,
  identityBadgeLabel,
} from "@abonten/core/identity/copy";
import { Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Alert, Pressable } from "react-native";

// "ID checked": the person behind this organizer showed Abonten a
// government ID and a live selfie. An icon beside the name; tapping it says
// exactly that, in the fixed words of @abonten/core/identity/copy (the same
// as the website's IdentityCheckedBadge), and nothing from the document.
export function IdentityCheckedPill() {
  const t = useTranslations("verification");
  const tc = useTranslations("core");
  const label = identityBadgeLabel(tc);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() =>
        Alert.alert(label, identityBadgeExplanation(tc), [{ text: t("gotIt") }])
      }
      className="active:opacity-70"
    >
      <Icon name="id-card-outline" size={16} tone="success" />
    </Pressable>
  );
}

/** A live check on an active account; a suspended or banned person loses it. */
export function showsIdentityBadge(
  info: {
    identity_verified?: boolean | null;
    identity_valid_until?: string | null;
    status_id?: number | null;
  } | null,
): boolean {
  if (!info?.identity_verified || info.status_id !== 1) return false;
  // get_public_profile already folds the expiry into identity_verified.
  if (info.identity_valid_until === undefined) return true;
  return (
    !!info.identity_valid_until &&
    Date.parse(info.identity_valid_until) > Date.now()
  );
}
