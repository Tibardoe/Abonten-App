// Three pulsing dots in a receiver-side bubble. CSS-only animation; honours
// prefers-reduced-motion via the media query below (the dots sit static).
export function TypingDots() {
  return (
    <div className="flex px-3 pt-1">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-card px-3 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
