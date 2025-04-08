export default async function page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const title = (await params).slug;

  const unformatTitle = title
    .split("-") // Split the string by hyphens
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize the first letter and lowercase the rest
    .join(" "); // Join the words back with spaces

  return <div>{unformatTitle}</div>;
}
