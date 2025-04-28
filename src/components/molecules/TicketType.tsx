export default function TicketType() {
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="flex justify-between items-center w-full text-sm"
      >
        Single Ticket Price
        <span className="w-[20px] h-[20px] rounded grid place-items-center border border-black">
          <span className="w-full h-full bg-black rounded-sm relative">
            <span className="w-[7px] h-[12px] border-r-2 border-b-[3px] border-white rotate-45 absolute top-[10%] left-1/2 -translate-x-1/2" />
          </span>
        </span>
      </button>

      <button
        type="button"
        className="flex justify-between items-center w-full text-sm"
      >
        Multiple Ticket Categories
        <span className="w-[20px] h-[20px] rounded grid place-items-center border border-black">
          <span className="w-full h-full bg-black rounded-sm relative">
            <span className="w-[7px] h-[12px] border-r-2 border-b-[3px] border-white rotate-45 absolute top-[10%] left-1/2 -translate-x-1/2" />
          </span>
        </span>
      </button>
    </div>
  );
}
