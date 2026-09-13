// weekly_section.icon_key -> the symbol web and mobile show next to a section
// title. This is the only place Abonten Weekly keeps emoji: the database stores
// a key, editors pick from this list, and an unknown key shows nothing.

export const WEEKLY_SECTION_ICONS = {
  sparkles: "✨",
  fire: "🔥",
  party: "🎉",
  new: "🆕",
  pin: "📍",
  music: "🎵",
  business: "💼",
  heart: "❤️",
  gem: "💎",
  free: "💰",
  ticket: "🎟️",
  star: "⭐",
  calendar: "📅",
  food: "🍽️",
  art: "🎨",
  sport: "⚽",
  family: "👨‍👩‍👧",
  outdoors: "🌴",
} as const;

export type WeeklySectionIconKey = keyof typeof WEEKLY_SECTION_ICONS;

export const WEEKLY_SECTION_ICON_KEYS = Object.keys(
  WEEKLY_SECTION_ICONS,
) as WeeklySectionIconKey[];

export function weeklySectionIcon(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return (WEEKLY_SECTION_ICONS as Record<string, string>)[key] ?? null;
}
