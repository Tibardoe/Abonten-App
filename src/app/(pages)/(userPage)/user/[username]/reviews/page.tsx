import { Button } from "@/components/ui/button";

export default async function page() {
  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No reviews yet</h1>

      <p>Leave a review and rating</p>

      <Button className="w-32 font-bold md:text-lg py-3 px-5">
        Add review
      </Button>
    </div>
  );
}
