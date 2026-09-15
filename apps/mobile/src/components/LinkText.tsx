import { openExternalLink } from "@/lib/legalLinks";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { hasLink, isSafeWebUrl, linkify } from "@abonten/core/linkify";
import { AppText, type AppTextProps } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert, type TextStyle } from "react-native";
import { redirectSystemPath } from "../../app/+native-intent";

// Text with web links rendered as tappable spans — used for chat messages.
// Detection lives in @abonten/core/linkify (conservative: http(s) and www.
// only). A link to abontenhub.com's own event / place / weekly / invite /
// messages pages opens the matching screen in the app (the same resolver a
// universal link goes through); anything else opens the in-app browser
// after one more scheme check, so a malformed or non-web URL can never be
// handed to the OS. Long URLs wrap like any other text; nothing is ever
// interpreted as markup.

const OWN_HOSTS = new Set(
  [PUBLIC_SITE_ORIGIN, "https://www.abontenhub.com"].map(
    (o) => new URL(o).hostname,
  ),
);
const IN_APP_SECTIONS = new Set([
  "events",
  "places",
  "weekly",
  "invite",
  "messages",
]);

export function LinkText({
  text,
  linkStyle,
  ...textProps
}: Omit<AppTextProps, "children"> & {
  text: string;
  /** Colour / decoration for the link spans (defaults to underline). */
  linkStyle?: TextStyle;
}) {
  const router = useRouter();
  const segments = useMemo(
    () => (hasLink(text) ? linkify(text) : null),
    [text],
  );

  if (!segments) return <AppText {...textProps}>{text}</AppText>;

  const open = (href: string) => openLink(href, router);

  return (
    <AppText {...textProps}>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <AppText
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and immutable for a given text
            key={i}
            {...textProps}
            accessibilityRole="link"
            style={[
              textProps.style,
              { textDecorationLine: "underline" },
              linkStyle,
            ]}
            onPress={() => open(seg.href)}
            onLongPress={() =>
              Alert.alert("Open link?", seg.href, [
                { text: "Cancel", style: "cancel" },
                { text: "Open", onPress: () => open(seg.href) },
              ])
            }
          >
            {seg.text}
          </AppText>
        ) : (
          seg.text
        ),
      )}
    </AppText>
  );
}

async function openLink(
  href: string,
  router: ReturnType<typeof useRouter>,
): Promise<void> {
  if (!isSafeWebUrl(href)) return;
  try {
    const url = new URL(href);
    const section = url.pathname.split("/").filter(Boolean)[0];
    if (
      OWN_HOSTS.has(url.hostname) &&
      section &&
      IN_APP_SECTIONS.has(section)
    ) {
      const path = await redirectSystemPath({ path: href, initial: false });
      // The resolver hands back the original URL when it has nothing better;
      // only a real in-app route is pushed.
      if (path.startsWith("/")) {
        router.push(path as never);
        return;
      }
    }
  } catch {
    // Not parseable as a URL — fall through to the browser guard below.
  }
  void openExternalLink(href);
}
