"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import {
  SHARE_FORMATS,
  type ShareImageFormat,
  shareImageFileName,
  shareImagePath,
  shareSubjectPath,
} from "@abonten/core/shareKit/shareKit";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The share kit on a manage page: the listing's ready-made images (story,
 * post and, for a place, "Now on Abonten") to download and post on the
 * owner's own socials, plus its link. The images are drawn by the website
 * (/api/share/...) from the public listing, so they exist only once the
 * listing is public.
 */
export default function ShareKitCard({
  kind,
  subjectKey,
  name,
  isPublic,
}: {
  kind: "events" | "places";
  /** The event code or the place slug. */
  subjectKey: string;
  name: string;
  isPublic: boolean;
}) {
  const t = useTranslations("manage");
  const locale = useLocale();
  const toast = useToast();
  const [failed, setFailed] = useState<
    Partial<Record<ShareImageFormat, boolean>>
  >({});

  const copyLink = async () => {
    const url = `${window.location.origin}${shareSubjectPath(kind, subjectKey)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("shareKit.linkCopied"));
    } catch {
      toast.error(t("shareKit.shareFailed"));
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{t("shareKit.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPublic ? t("shareKit.intro") : t("shareKit.notPublic")}
        </p>
      </div>

      {isPublic ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SHARE_FORMATS[kind].map((format) => {
            const src = shareImagePath(kind, subjectKey, format, locale);
            return (
              <figure key={format} className="min-w-0 space-y-2">
                <div className="overflow-hidden rounded-lg border border-border bg-muted">
                  {failed[format] ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      {t("shareKit.loadFailed")}
                    </p>
                  ) : (
                    // A generated image from our own route; next/image would
                    // only re-encode it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={t("shareKit.previewAlt", {
                        format: t(`shareKit.${format}`),
                        name,
                      })}
                      loading="lazy"
                      className="block h-auto w-full"
                      onError={() =>
                        setFailed((prev) => ({ ...prev, [format]: true }))
                      }
                    />
                  )}
                </div>
                <figcaption className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t(`shareKit.${format}`)}</span>
                  <a
                    href={src}
                    download={shareImageFileName(subjectKey, format)}
                    className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("shareKit.download")}
                  </a>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}

      <Button type="button" variant="outline" onClick={copyLink}>
        {t("shareKit.copyLink")}
      </Button>
    </section>
  );
}
