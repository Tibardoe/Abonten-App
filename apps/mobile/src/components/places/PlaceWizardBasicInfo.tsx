import { MapPickerSheet } from "@/components/explore/MapPickerSheet";
import type { PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, Chip, Field, Icon, Input } from "@abonten/ui-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Step 2 of the place wizard — the schema-covered text fields plus the
// category picker and the address resolver (autocomplete suggestions,
// "choose on map", or current location). Mirrors the web
// PlaceCreateStepBasicInfo.
export function PlaceWizardBasicInfo({ w }: { w: PlaceWizard }) {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <View className="gap-4">
      <Field label="Name" error={w.textErrors.name}>
        <Input
          value={w.name}
          onChangeText={w.setName}
          placeholder="e.g. The Roastery Coffee Bar"
        />
      </Field>

      <Field label="Category">
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

      <Field label="Description" error={w.textErrors.description}>
        <Input
          value={w.description}
          onChangeText={w.setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          placeholder="What should visitors know about this place?"
        />
      </Field>

      <Field
        label="Location"
        hint="Search, choose on the map, or use your current location."
      >
        <Input
          value={w.autocomplete.query}
          onChangeText={w.autocomplete.setQuery}
          placeholder="Start typing an address…"
          autoCorrect={false}
        />
        {w.resolvingLocation ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <AppText variant="meta">Resolving location…</AppText>
          </View>
        ) : null}
        {w.autocomplete.predictions.length > 0 ? (
          <View className="overflow-hidden rounded-lg border border-border">
            {w.autocomplete.predictions.map((p) => (
              <Pressable
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
            onPress={() => setMapOpen(true)}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="map-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              Choose on map
            </AppText>
          </Pressable>
          <Pressable
            onPress={w.useCurrentLocation}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Icon name="locate-outline" size={16} tone="primary" />
            <AppText variant="small" tone="brand">
              Current location
            </AppText>
          </Pressable>
        </View>
        {w.address && w.coords ? (
          <AppText variant="meta">Selected: {w.address}</AppText>
        ) : null}
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

      <Field label="Phone" error={w.textErrors.phone} hint="Optional">
        <Input
          value={w.phone}
          onChangeText={w.setPhone}
          keyboardType="phone-pad"
          placeholder="+233…"
        />
      </Field>

      <Field label="WhatsApp" error={w.textErrors.whatsapp} hint="Optional">
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
