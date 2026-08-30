import StatTile from "@/components/atoms/StatTile";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";

type ManagePlaceInsightsSectionProps = {
  insights: Record<string, number>;
  isError: boolean;
  onRetry: () => void;
};

// Owner-facing stat tiles for a place, per the Places spec §26 example
// ("Place Views / Directions / Phone Calls / WhatsApp / Favorites /
// Reviews"). `insights` is fetched server-side by the manage page
// (getPlaceInsights.ts) and passed down as a prop, same convention
// ManagePlaceReviewsSection.tsx's initialPage uses rather than a client
// useQuery -- this page already fetches everything else up front.
export default function ManagePlaceInsightsSection({
  insights,
  isError,
  onRetry,
}: ManagePlaceInsightsSectionProps) {
  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load this place's insights."
        onRetry={onRetry}
      />
    );
  }

  const tiles = [
    { label: "Place Views", value: insights.view ?? 0 },
    { label: "Directions", value: insights.direction_click ?? 0 },
    { label: "Phone Calls", value: insights.phone_click ?? 0 },
    { label: "WhatsApp", value: insights.whatsapp_click ?? 0 },
    { label: "Favorites", value: insights.favorites ?? 0 },
    { label: "Reviews", value: insights.reviews ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <StatTile
          key={tile.label}
          label={tile.label}
          value={tile.value.toLocaleString()}
        />
      ))}
    </div>
  );
}
