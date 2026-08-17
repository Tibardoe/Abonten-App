import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import TransactionRowSkeleton from "@/components/molecules/TransactionRowSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <StatTilesSkeleton count={6} />
      <ul>
        {Array.from({ length: 6 }, (_, i) => (
          <TransactionRowSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
