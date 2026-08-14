import EventCardSkeleton from "@/components/molecules/EventCardSkeleton";

export default function Loading() {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {Array.from({ length: 8 }, (_, i) => (
        <EventCardSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}
