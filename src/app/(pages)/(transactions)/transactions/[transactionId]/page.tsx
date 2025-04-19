import ViewReciptButton from "@/components/atoms/ViewReciptButton";
import { Button } from "@/components/ui/button";
import { transactionsDummyData } from "@/data/transactionsDummyData";
import Image from "next/image";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle } from "react-icons/io";
import { MdCancel } from "react-icons/md";

export default async function page({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;

  const transactionSlip = transactionsDummyData.find(
    (transaction) => transaction.transactionId === transactionId,
  );

  return (
    <div className="space-y-10 text-sm mb-5 md:mb-0 w-full">
      <div className="font-bold text-gray-500 flex justify-between items-center bg-black bg-opacity-5 rounded-md p-5">
        <p>Payment Amount</p>
        <p>
          {transactionSlip?.currency} {transactionSlip?.amount}
        </p>
      </div>

      <div className="font-semibold text-gray-500 bg-black bg-opacity-5 rounded-md p-5 space-y-5">
        <div className="flex justify-between items-center">
          <p>Payment Wallet</p>
          <p>{transactionSlip?.paymentOption}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Transaction Id</p>
          <p>{transactionSlip?.transactionId}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Name</p>
          <p>{transactionSlip?.name}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Phone</p>
          <p>{transactionSlip?.phone}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Email</p>
          <p>{transactionSlip?.email}</p>
        </div>

        {transactionSlip?.planType !== null ? (
          <div className="flex justify-between items-center">
            <p>Plan</p>
            <p>{transactionSlip?.planType}</p>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <p>Reason</p>
            <p>{transactionSlip?.reason}</p>
          </div>
        )}

        <div className="flex justify-between items-center">
          <p>Created At</p>
          <p>{transactionSlip?.date}</p>
        </div>
      </div>

      <div className="space-y-10">
        <div className="flex gap-3">
          {transactionSlip?.status === "Successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {transactionSlip?.status === "Pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {transactionSlip?.status === "Failed" && (
            <MdCancel className="text-2xl md:text-3xl" />
          )}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Created Request</p>
            <p className="font-bold text-gray-500">
              Customer Phone: {transactionSlip?.phone}
            </p>
            <p className="font-bold text-gray-500">
              Customer Email: {transactionSlip?.email}
            </p>
            <p className="font-bold text-gray-500">{transactionSlip?.date}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {transactionSlip?.status === "Successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {transactionSlip?.status === "Pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {transactionSlip?.status === "Failed" && (
            <MdCancel className="text-2xl md:text-3xl" />
          )}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Debit Account</p>
            <p className="font-bold text-gray-500">
              Payment Method: {transactionSlip?.paymentOption}
            </p>
            <p className="font-bold text-gray-500">{transactionSlip?.date}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {transactionSlip?.status === "Successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {transactionSlip?.status === "Pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {transactionSlip?.status === "Failed" && (
            <MdCancel className="text-2xl md:text-3xl" />
          )}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Top Up</p>
            <p className="font-bold text-gray-500">
              Customer Name: {transactionSlip?.name}
            </p>
            {transactionSlip?.reason === "Ticket Purchase" &&
              transactionSlip.qrCodeUrl &&
              transactionSlip.status === "Successful" && (
                <div className="font-bold text-gray-500 space-y-2">
                  <p>Event Pass:</p>
                  <Image
                    src={transactionSlip.qrCodeUrl}
                    alt="Qr code"
                    height={100}
                    width={100}
                  />
                </div>
              )}
            <p className="font-bold text-gray-500">
              Customer Email: {transactionSlip?.email}
            </p>
            <p className="font-bold text-gray-500">{transactionSlip?.date}</p>
          </div>
        </div>
      </div>

      <div className="flex md:justify-end">
        <ViewReciptButton />
      </div>
    </div>
  );
}
