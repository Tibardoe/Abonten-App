import Image from "next/image";

export default function Higlight() {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Highlights</h2>

      <button type="button">
        <Image
          src="/assets/images/highlight.svg"
          alt="Highlight button"
          width={80}
          height={80}
        />
      </button>
    </div>
  );
}
