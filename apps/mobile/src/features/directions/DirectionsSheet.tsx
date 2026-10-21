import {
  CLIPBOARD_SUPPORTED,
  copyText,
} from "@/features/messaging/clipboardSupport";
import {
  type DirectionsTarget,
  type MapsApp,
  locationLink,
  locationShareTitle,
  mapsAppsForPlatform,
  openDirectionsIn,
  readLastMapsApp,
  rememberMapsApp,
} from "@/lib/directions";
import { shareLink } from "@/lib/share";
import {
  AppText,
  type IoniconName,
  Sheet,
  SheetOption,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

// "Directions" on an event, a place or a ticket: the person picks the maps
// app (the one they used last is on top), or shares the location to book a
// ride or meet a friend. Bolt and Yango publish no link that fills in a
// destination, so sharing or copying the address is how a ride gets booked.

const APP_ICON: Record<MapsApp, IoniconName> = {
  google: "map-outline",
  apple: "compass-outline",
  waze: "car-outline",
};

const APP_LABEL: Record<MapsApp, "googleMaps" | "appleMaps" | "waze"> = {
  google: "googleMaps",
  apple: "appleMaps",
  waze: "waze",
};

export function DirectionsSheet({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: DirectionsTarget;
}) {
  const t = useTranslations("explore");
  const toast = useToast();
  const [last, setLast] = useState<MapsApp | null>(null);
  // The share sheet is a native modal: it opens once this sheet has gone.
  const shareAfterClose = useRef(false);

  useEffect(() => {
    if (open) void readLastMapsApp().then(setLast);
  }, [open]);

  const apps = useMemo(() => {
    const offered = mapsAppsForPlatform();
    return last && offered.includes(last)
      ? [last, ...offered.filter((app) => app !== last)]
      : offered;
  }, [last]);

  const openIn = async (app: MapsApp) => {
    onClose();
    void rememberMapsApp(app);
    if (!(await openDirectionsIn(app, target))) {
      toast.error(t("couldnTOpenMaps"), {
        description: t("noMapsAppIsAvailableOn"),
      });
    }
  };

  const copyAddress = async () => {
    onClose();
    if (await copyText(target.address || target.label)) {
      toast.success(t("addressCopied"));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onDismiss={() => {
        if (!shareAfterClose.current) return;
        shareAfterClose.current = false;
        void shareLink(locationShareTitle(target), locationLink(target));
      }}
      title={t("getThere")}
    >
      <View className="gap-3">
        <View className="gap-0.5">
          <AppText variant="bodyStrong" numberOfLines={2}>
            {target.label}
          </AppText>
          {target.address ? (
            <AppText variant="meta" numberOfLines={2}>
              {target.address}
            </AppText>
          ) : null}
        </View>

        <AppText variant="label">{t("openIn")}</AppText>
        {apps.map((app) => (
          <SheetOption
            key={app}
            icon={APP_ICON[app]}
            title={t(APP_LABEL[app])}
            subtitle={app === last ? t("lastUsed") : undefined}
            onPress={() => void openIn(app)}
          />
        ))}

        <AppText variant="label" className="pt-2">
          {t("bookingARide")}
        </AppText>
        <SheetOption
          icon="share-outline"
          title={t("shareLocation")}
          subtitle={t("sendItToYourDriverOr")}
          onPress={() => {
            shareAfterClose.current = true;
            onClose();
          }}
        />
        {CLIPBOARD_SUPPORTED ? (
          <SheetOption
            icon="copy-outline"
            title={t("copyAddress")}
            subtitle={t("pasteItIntoYourRideApp")}
            onPress={() => void copyAddress()}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** The sheet plus the function that opens it, for a detail screen. */
export function useDirections(target: DirectionsTarget) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const sheet = (
    <DirectionsSheet
      open={open}
      onClose={() => setOpen(false)}
      target={target}
    />
  );
  return { show, sheet };
}
