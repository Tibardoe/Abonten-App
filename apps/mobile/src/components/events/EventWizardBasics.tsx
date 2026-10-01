import type { EventWizard } from "@/features/events/useEventWizard";
import { AppText, Chip, Field, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Switch, View } from "react-native";

// Step 2 of the event wizard — title, description, category + types,
// capacity, website, and the require-registration toggle. Mirrors the web
// EventUploadFormFields "Event basics" + "Event details" sections.
// Step navigation is owned by the screen header (app/(app)/event/new.tsx).
export function EventWizardBasics({ w }: { w: EventWizard }) {
  const t = useTranslations("events");

  return (
    <View className="gap-4">
      <Field label={t("title")} error={w.textErrors.title}>
        <Input
          value={w.title}
          onChangeText={w.setTitle}
          placeholder={t("eGSunsetRooftopSession")}
        />
      </Field>

      <Field label={t("description")} error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          placeholder={t("tellPeopleWhatToExpect")}
        />
      </Field>

      <Field label={t("category")}>
        <View className="flex-row flex-wrap gap-2">
          {w.categories.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={c === w.category}
              onPress={() => w.selectCategory(c)}
            />
          ))}
        </View>
      </Field>

      {w.category ? (
        <Field label={t("types")} hint={t("pickOneOrMore")}>
          <View className="flex-row flex-wrap gap-2">
            {w.categoryTypes.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={w.types.includes(t)}
                onPress={() => w.toggleType(t)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field
        label={t("capacity2")}
        error={w.textErrors.capacity}
        hint={t("optionalTotalAttendeesAllowed")}
      >
        <Input
          value={w.capacity}
          onChangeText={w.setCapacity}
          keyboardType="number-pad"
          placeholder={t("eG200")}
        />
      </Field>

      <Field
        label={t("website")}
        error={w.textErrors.website_url}
        hint={t("optional")}
      >
        <Input
          value={w.website}
          onChangeText={w.setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://example.com"
        />
      </Field>

      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3">
        <View className="flex-1 pr-3">
          <AppText variant="bodyStrong">{t("requireRegistration")}</AppText>
          <AppText variant="meta">{t("attendeesMustRegisterEvenForA")}</AppText>
        </View>
        <Switch
          value={w.requireRegistration}
          onValueChange={w.setRequireRegistration}
        />
      </View>
    </View>
  );
}
