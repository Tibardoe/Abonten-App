import { type Country, matchCountry } from "@abonten/core/countries";
import { AppText, Icon, Input, Sheet } from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

// The phone country-code control: a compact "🇬🇭 +233 ▾" chip that opens a
// searchable country sheet (match on name or dial code). Country data is the
// shared @abonten/core/countries list, so it stays in lock-step with the web
// PhoneInput dropdown.

export function CountryCodeField({
  value,
  onChange,
}: {
  value: Country;
  onChange: (country: Country) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = matchCountry(query);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Country code, currently ${value.name} ${value.callingCode}`}
        onPress={() => setOpen(true)}
        className="h-[48px] flex-row items-center gap-1.5 rounded-lg border border-input bg-background px-3 active:opacity-70"
      >
        <AppText className="text-[16px]">{value.flag}</AppText>
        <AppText className="text-[15px] font-medium text-foreground">
          {value.callingCode}
        </AppText>
        <Icon name="chevron-down" size={14} tone="muted" />
      </Pressable>

      <Sheet open={open} onClose={close} title="Select country">
        <View className="gap-3">
          <Input
            placeholder="Search by name or code"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View className="overflow-hidden rounded-lg border border-border">
            {results.length === 0 ? (
              <AppText className="p-3 text-[13px] text-muted-foreground">
                No country matches “{query}”.
              </AppText>
            ) : (
              results.map((c, i) => {
                const selected = c.countryCode === value.countryCode;
                return (
                  <Pressable
                    key={c.countryCode}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(c);
                      close();
                    }}
                    className={`flex-row items-center gap-3 px-3 py-3 active:opacity-70 ${
                      i > 0 ? "border-t border-border" : ""
                    } ${selected ? "bg-accent" : ""}`}
                  >
                    <AppText className="text-[18px]">{c.flag}</AppText>
                    <AppText className="flex-1 text-[14px] text-foreground">
                      {c.name}
                    </AppText>
                    <AppText className="text-[13px] text-muted-foreground">
                      {c.callingCode}
                    </AppText>
                    {selected ? (
                      <Icon name="checkmark" size={16} tone="primary" />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </Sheet>
    </>
  );
}
