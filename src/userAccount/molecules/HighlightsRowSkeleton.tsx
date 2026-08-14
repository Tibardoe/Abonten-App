import { Skeleton } from "@/components/ui/skeleton";

export default function HighlightsRowSkeleton() {
  return (
    <ul className="flex items-center overflow-hidden">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i.toLocaleString()} className="shrink-0 m-1">
          <Skeleton className="w-[70px] h-[70px] rounded-full" />
        </li>
      ))}
    </ul>
  );
}
