import ReviewCardSkeleton from "@/components/molecules/ReviewCardSkeleton";

export default function Loading() {
  return (
    <ul className="flex flex-col gap-6">
      {Array.from({ length: 4 }, (_, i) => (
        <ReviewCardSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}
