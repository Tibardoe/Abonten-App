import type { EventWizard } from "@/features/events/useEventWizard";
import { AppText, Field, Input } from "@abonten/ui-native";
import { Pressable, Switch, View } from "react-native";

// Step 2 of the event wizard — title, description, category + types,
// capacity, website, and the require-registration toggle. Mirrors the web
// EventUploadFormFields "Event basics" + "Event details" sections.
// Step navigation is owned by the screen header (app/(app)/event/new.tsx).
export function EventWizardBasics({ w }: { w: EventWizard }) {
  return (
    <View className="gap-4">
      <Field label="Title" error={w.textErrors.title}>
        <Input
          value={w.title}
          onChangeText={w.setTitle}
          placeholder="e.g. Sunset Rooftop Session"
        />
      </Field>

      <Field label="Description" error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          placeholder="Tell people what to expect."
        />
      </Field>

      <Field label="Category">
        <View className="flex-row flex-wrap gap-2">
          {w.categories.map((c) => {
            const active = c === w.category;
            return (
              <Pressable
                key={c}
                onPress={() => w.selectCategory(c)}
                className={
                  active
                    ? "rounded-full bg-primary px-3 py-1.5"
                    : "rounded-full border border-border px-3 py-1.5"
                }
              >
                <AppText
                  className={
                    active
                      ? "text-[13px] font-semibold text-primary-foreground"
                      : "text-[13px] font-medium text-muted-foreground"
                  }
                >
                  {c}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {w.category ? (
        <Field label="Types" hint="Pick one or more">
          <View className="flex-row flex-wrap gap-2">
            {w.categoryTypes.map((t) => {
              const active = w.types.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => w.toggleType(t)}
                  className={
                    active
                      ? "rounded-full bg-primary px-3 py-1.5"
                      : "rounded-full border border-border px-3 py-1.5"
                  }
                >
                  <AppText
                    className={
                      active
                        ? "text-[13px] font-semibold text-primary-foreground"
                        : "text-[13px] font-medium text-muted-foreground"
                    }
                  >
                    {t}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Field>
      ) : null}

      <Field
        label="Capacity"
        error={w.textErrors.capacity}
        hint="Optional — total attendees allowed"
      >
        <Input
          value={w.capacity}
          onChangeText={w.setCapacity}
          keyboardType="number-pad"
          placeholder="e.g. 200"
        />
      </Field>

      <Field label="Website" error={w.textErrors.website_url} hint="Optional">
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
          <AppText variant="bodyStrong">Require registration</AppText>
          <AppText variant="meta">
            Attendees must register even for a free event.
          </AppText>
        </View>
        <Switch
          value={w.requireRegistration}
          onValueChange={w.setRequireRegistration}
        />
      </View>
    </View>
  );
}
