import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import type { PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, Chip, Field, Icon, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Step 2 of the place wizard — the schema-covered text fields plus the
// category picker and the address resolver (autocomplete suggestions,
// "choose on map", or current location). Mirrors the web
// PlaceCreateStepBasicInfo.
export function PlaceWizardBasicInfo({ w }: { w: PlaceWizard }) {
  const t = useTranslations("places");

  const [mapOpen, setMapOpen] = useState(false);

  return (
    <View className="gap-4">
      <Field label={t("name")} error={w.textErrors.name}>
        <Input
          value={w.name}
          onChangeText={w.setName}
          placeholder={t("eGTheRoasteryCoffeeBar")}
        />
      </Field>

      <Field label={t("category")}>
        <View className="flex-row flex-wrap gap-2">
          {w.categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={cat.id === w.categoryId}
              onPress={() => w.setCategoryId(cat.id)}
            />
          ))}
        </View>
      </Field>

      <Field label={t("description")} error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          placeholder={t("whatShouldVisitorsKnowAboutThis")}
        />
      </Field>

      <Field label={t("location")} hint={t("searchChooseOnTheMapOr")}>
        <Input
          value={w.autocomplete.query}
          onChangeText={w.autocomplete.setQuery}
          placeholder={t("startTypingAnAddress")}
          autoCorrect={false}
        />
        {w.resolvingLocation ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <AppText variant="meta">{t("resolvingLocation2")}</AppText>
          </View>
        ) : null}
        {w.autocomplete.predictions.length > 0 ? (
          <View className="overflow-hidden rounded-lg border border-border">
            {w.autocomplete.predictions.map((p) => (
              <Pressable
                accessibilityRole="button"
                key={p.placeId}
                onPress={() => w.pickSuggestion(p.placeId)}
                className="border-border border-b px-3 py-2 active:opacity-70"
              >
                <AppText variant="small">{p.primary}</AppText>
                {p.secondary ? (
                  <AppText variant="caption">{p.secondary}</AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        <View className="flex-row gap-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => setMapOpen(true)}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              {t("chooseOnMap")}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={w.useCurrentLocation}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="locate-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              {t("currentLocation")}
            </AppText>
          </Pressable>
        </View>
        {w.address && w.coords ? (
          <AppText variant="meta">
            {t("selected", { address: w.address })}
          </AppText>
        ) : null}
      </Field>

      <Field
        label={t("website2")}
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

      <Field
        label={t("phone2")}
        error={w.textErrors.phone}
        hint={t("optional")}
      >
        <Input
          value={w.phone}
          onChangeText={w.setPhone}
          keyboardType="phone-pad"
          placeholder="+233…"
        />
      </Field>

      <Field
        label="WhatsApp"
        error={w.textErrors.whatsapp}
        hint={t("optional")}
      >
        <Input
          value={w.whatsapp}
          onChangeText={w.setWhatsapp}
          keyboardType="phone-pad"
          placeholder="+233…"
        />
      </Field>

      <MapPickerSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={w.coords}
        onPick={(loc) => w.setMapLocation(loc)}
      />
    </View>
  );
}
