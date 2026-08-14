import TransactionRowSkeleton from "@/components/molecules/TransactionRowSkeleton";

export default function Loading() {
  return (
    <ul>
      {Array.from({ length: 6 }, (_, i) => (
        <TransactionRowSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}
