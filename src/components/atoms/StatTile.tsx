export default function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-bold text-xl md:text-2xl mt-1">{value}</p>
      {sublabel && (
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      )}
    </div>
  );
}
