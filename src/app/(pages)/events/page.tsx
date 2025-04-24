import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";

export default function page() {
  return (
    <div className="h-dvh">
      <LocationAndFilterSection />
      <div className="h-[50%] flex justify-center items-center">
        No address set
      </div>
    </div>
  );
}
