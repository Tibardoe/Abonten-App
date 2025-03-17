import { Button } from "@/components/ui/button";

export default function Posts() {
  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No posts yet</h1>

      <p>Post events for others to attend</p>

      <Button className="w-32 font-bold text-lg">Post</Button>
    </div>
  );
}
