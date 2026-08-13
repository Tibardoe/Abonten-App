import { transactionsDummyData } from "@/data/transactionsDummyData";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import Image from "next/image";
import { IoChevronBackSharp } from "react-icons/io5";
import { Button } from "../ui/button";

type ReceiptButtonProp = {
  handleShowReceipt: (state: boolean) => void;
  transactionId: string;
};

export default function RecieptModal({
  handleShowReceipt,
  transactionId,
}: ReceiptButtonProp) {
  const transactionSlip = transactionsDummyData.find(
    (transaction) => transactionId === transaction.transactionId,
  );

  useBodyScrollLock(true);

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-10">
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-fit lg:w-[40%] md:rounded-xl p-5 space-y-5">
        <button
          type="button"
          onClick={() => handleShowReceipt(false)}
          className="md:hidden flex font-bold text-2xl mb-10"
        >
          <IoChevronBackSharp />
        </button>

        <h1 className="text-3xl md:text-4xl font-bold mx-auto text-start md:text-end mb-10 md:mb-10">
          Ticket
        </h1>

        <h2 className="font-bold text-2xl">Abonten</h2>

        <div className="flex justify-between items-center font-bold text-muted-foreground">
          <p>Customer Name:</p>

          <p>{transactionSlip?.name}</p>
        </div>

        <div className="flex justify-between items-center font-bold text-muted-foreground">
          <p>Transaction Id:</p>

          <p>{transactionSlip?.transactionId}</p>
        </div>

        <div className="flex justify-between items-center font-bold text-muted-foreground">
          <div>
            <p>Payment Method</p>
            <p className="text-foreground">{transactionSlip?.paymentOption}</p>
          </div>

          <div>
            <p className="text-end">Date and Time</p>
            <p className="text-foreground">{transactionSlip?.date}</p>
          </div>
        </div>

        <div className="flex justify-between items-center font-bold text-muted-foreground bg-muted py-4">
          <p>Description</p>
          <p className="text-foreground">Amount</p>
        </div>

        <div className="font-bold text-muted-foreground space-y-3">
          <p>{transactionSlip?.reason}</p>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              {transactionSlip?.reason === "Plan Subscription" ? (
                <p>{`Subscription Type: ${transactionSlip?.planType}`}</p>
              ) : (
                <p>{`Event Id: ${"event id"}`}</p>
              )}

              <p className="text-foreground">
                {transactionSlip?.currency} {transactionSlip?.amount}
              </p>
            </div>

            <hr className="border-border" />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-foreground">Total Amount</p>

            <p className="text-foreground">
              {transactionSlip?.currency} {transactionSlip?.amount}
            </p>
          </div>

          {transactionSlip?.reason === "Ticket Purchase" &&
            transactionSlip.qrCodeUrl &&
            transactionSlip.status === "Successful" && (
              <div className="font-bold text-muted-foreground space-y-2">
                <p>Event Pass:</p>
                <Image
                  src={transactionSlip.qrCodeUrl}
                  alt="Qr code"
                  height={100}
                  width={100}
                />
              </div>
            )}
        </div>

        <div className="flex gap-2 md:justify-end">
          <Button
            variant={"outline"}
            onClick={() => handleShowReceipt(false)}
            className="border border-border hidden md:flex font-bold"
          >
            Cancel
          </Button>

          <Button className="w-full md:w-fit rounded-full md:rounded-md p-6 md:p-3 font-bold">
            Download As PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
