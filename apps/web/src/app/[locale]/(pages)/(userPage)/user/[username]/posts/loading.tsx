import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";

export default function Loading() {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <EventCardSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}
