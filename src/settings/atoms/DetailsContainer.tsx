export default function DetailsContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md p-4 space-y-4">
      {children}
    </div>
  );
}
