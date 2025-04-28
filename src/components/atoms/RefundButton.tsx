import { RiRefund2Fill } from "react-icons/ri";

export default function RefundButton() {
  return (
    <button type="button" className="flex items-center gap-1 p-1">
      <RiRefund2Fill className="text-xl" />
      Request for Refund
    </button>
  );
}
