export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return <div>Attendance</div>;
}
