import {
  PROFILE_COMPLETION_GROUP_TITLES,
  type ProfileCompletion,
  type ProfileCompletionGroup,
  type ProfileCompletionItem,
} from "@abonten/core/profileCompletion";
import { AppText, Icon, type IoniconName, Label } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The account-setup steps, grouped ("Your profile", "Sign-in & contact"):
// what each one is, whether it's done, why it helps, and one tap to do it.
// Done steps stay listed (ticked) so people can see what's already in place.

const ICONS: Record<ProfileCompletionItem["key"], IoniconName> = {
  name: "person-outline",
  username: "at-outline",
  avatar: "camera-outline",
  email: "mail-outline",
  phone: "call-outline",
};

function Row({
  item,
  onPress,
}: {
  item: ProfileCompletionItem;
  onPress: () => void;
}) {
  const done = item.complete;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        done
          ? `${item.doneLabel}. Tap to change.`
          : `${item.label}. ${item.description}`
      }
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          done ? "bg-success/15" : "bg-accent"
        }`}
      >
        <Icon
          name={done ? "checkmark" : ICONS[item.key]}
          size={20}
          tone={done ? "success" : "primary"}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <AppText variant="bodyStrong">
          {done ? item.doneLabel : item.label}
        </AppText>
        {!done ? <AppText variant="meta">{item.description}</AppText> : null}
        {item.state === "unverified" ? (
          <AppText variant="caption" tone="warning">
            Waiting for a code
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}

export function AccountSetupChecklist({
  completion,
  groups = ["profile", "account"],
  onItemPress,
}: {
  completion: ProfileCompletion;
  groups?: ProfileCompletionGroup[];
  onItemPress: (item: ProfileCompletionItem) => void;
}) {
  return (
    <View className="gap-5">
      {groups.map((group) => {
        const items = completion.items.filter((i) => i.group === group);
        const done = items.filter((i) => i.complete).length;
        return (
          <View key={group} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Label>{PROFILE_COMPLETION_GROUP_TITLES[group]}</Label>
              <AppText variant="caption">
                {done} of {items.length} done
              </AppText>
            </View>
            {items.map((item) => (
              <Row
                key={item.key}
                item={item}
                onPress={() => onItemPress(item)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
