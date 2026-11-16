import { supabase } from "@/lib/supabase";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import {
  SHARE_FORMATS,
  type ShareImageFormat,
  hasShareImages,
  shareImageFileName,
  shareImagePath,
  shareSubjectPath,
} from "@abonten/core/shareKit/shareKit";
import { AppText, Button, Overline, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Share, View } from "react-native";

type Subject = { key: string; name: string; isPublic: boolean };

/**
 * The listing's code or slug and whether it is public, read directly: the
 * owner (or a member acting for the team) may read their own listing, and
 * a public one anyone may.
 */
function useShareSubject(kind: "events" | "places", id: string) {
  return useQuery({
    queryKey: ["share-kit-subject", kind, id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Subject | null> => {
      if (kind === "events") {
        const { data, error } = await supabase
          .from("event")
          .select("event_code, title, published_at, status, moderation_state")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return data?.event_code
          ? {
              key: data.event_code,
              name: data.title ?? "",
              isPublic: hasShareImages(data),
            }
          : null;
      }
      const { data, error } = await supabase
        .from("place")
        .select("slug, name, published_at, status, moderation_state")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data?.slug
        ? { key: data.slug, name: data.name, isPublic: hasShareImages(data) }
        : null;
    },
  });
}

/**
 * The share kit (packages/core/src/shareKit/shareKit.ts) on the organizer's
 * event screen and the place screen: ready-made images for the owner's own
 * Instagram, TikTok or WhatsApp Status, shared through the phone's sheet.
 */
export function ShareKitSection({
  kind,
  id,
}: { kind: "events" | "places"; id: string }) {
  const t = useTranslations("manage");
  const { locale } = useLocale();
  const toast = useToast();
  const q = useShareSubject(kind, id);
  const [busy, setBusy] = useState<ShareImageFormat | null>(null);
  const subject = q.data;
  if (!subject) return null;

  const shareImage = async (format: ShareImageFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const target = new File(
        Paths.cache,
        shareImageFileName(subject.key, format),
      );
      const file = await File.downloadFileAsync(
        `${PUBLIC_SITE_ORIGIN}${shareImagePath(kind, subject.key, format, locale)}`,
        target,
        { idempotent: true },
      );
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("sharing unavailable");
      await Sharing.shareAsync(file.uri, {
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      toast.error(t("shareKit.shareFailed"));
    } finally {
      setBusy(null);
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({
        message: `${PUBLIC_SITE_ORIGIN}${shareSubjectPath(kind, subject.key)}`,
      });
    } catch {
      toast.error(t("shareKit.shareFailed"));
    }
  };

  return (
    <View className="gap-3">
      <Overline>{t("shareKit.title")}</Overline>
      <AppText variant="small" tone="muted">
        {subject.isPublic ? t("shareKit.intro") : t("shareKit.notPublic")}
      </AppText>
      {subject.isPublic ? (
        <View className="flex-row flex-wrap gap-3">
          {SHARE_FORMATS[kind].map((format) => (
            <View key={format} className="w-[30%] min-w-[96px] gap-2">
              <Image
                source={{
                  uri: `${PUBLIC_SITE_ORIGIN}${shareImagePath(kind, subject.key, format, locale)}`,
                }}
                style={{
                  width: "100%",
                  aspectRatio: format === "story" ? 9 / 16 : 4 / 5,
                  borderRadius: 8,
                }}
                contentFit="cover"
                accessibilityLabel={t("shareKit.previewAlt", {
                  format: t(`shareKit.${format}`),
                  name: subject.name,
                })}
              />
              <Button
                title={
                  busy === format
                    ? t("shareKit.preparing")
                    : t(`shareKit.${format}`)
                }
                variant="outline"
                size="sm"
                loading={busy === format}
                disabled={busy !== null}
                onPress={() => shareImage(format)}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Button
        title={t("shareKit.share")}
        variant="outline"
        onPress={shareLink}
      />
    </View>
  );
}
