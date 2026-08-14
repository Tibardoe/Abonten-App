import { getUserTransactions } from "@/actions/getUserTransactions";
import ViewReciptButton from "@/components/atoms/ViewReciptButton";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { humanizeTransactionReason } from "@/utils/humanizeTransactionReason";
import Image from "next/image";
import { BsFillDashCircleFill } from "react-icons/bs";
import { IoMdCheckmarkCircle } from "react-icons/io";
import { MdCancel } from "react-icons/md";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/abonten/image/upload/";

export default async function page({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;

  const transactions = await getUserTransactions();

  const transactionSlip = transactions.data?.find(
    (transaction) => transaction.id === transactionId,
  );

  const status = transactionSlip?.status?.toLowerCase();
  const formattedDate = transactionSlip
    ? formatSingleDateTime(transactionSlip.transaction_date).date
    : "";
  const planName = transactionSlip?.subscription?.subscription_plan?.name;
  const qrCodeUrl =
    transactionSlip?.reason === "Ticket_Purchase" &&
    transactionSlip?.ticket?.qr_public_id
      ? `${CLOUDINARY_BASE_URL}v${transactionSlip.ticket.qr_version}/${transactionSlip.ticket.qr_public_id}.jpg`
      : null;

  return (
    <div className="space-y-10 text-sm mb-5 md:mb-0 w-full">
      <div className="font-bold text-muted-foreground flex justify-between items-center bg-muted rounded-md p-5">
        <p>Payment Amount</p>
        <p>
          {transactionSlip?.currency} {transactionSlip?.amount}
        </p>
      </div>

      <div className="font-semibold text-muted-foreground bg-muted rounded-md p-5 space-y-5">
        <div className="flex justify-between items-center">
          <p>Payment Wallet</p>
          <p>{transactionSlip?.payment_method}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Transaction Id</p>
          <p>{transactionSlip?.id}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Name</p>
          <p>{transactionSlip?.full_name}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Phone</p>
          <p>{transactionSlip?.phone_number}</p>
        </div>

        <div className="flex justify-between items-center">
          <p>Customer Email</p>
          <p>{transactionSlip?.email}</p>
        </div>

        {planName ? (
          <div className="flex justify-between items-center">
            <p>Plan</p>
            <p>{planName}</p>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <p>Reason</p>
            <p>{humanizeTransactionReason(transactionSlip?.reason)}</p>
          </div>
        )}

        <div className="flex justify-between items-center">
          <p>Created At</p>
          <p>{formattedDate}</p>
        </div>
      </div>

      <div className="space-y-10">
        <div className="flex gap-3">
          {status === "successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {status === "pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {status === "failed" && <MdCancel className="text-2xl md:text-3xl" />}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Created Request</p>
            <p className="font-bold text-muted-foreground">
              Customer Phone: {transactionSlip?.phone_number}
            </p>
            <p className="font-bold text-muted-foreground">
              Customer Email: {transactionSlip?.email}
            </p>
            <p className="font-bold text-muted-foreground">{formattedDate}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {status === "successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {status === "pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {status === "failed" && <MdCancel className="text-2xl md:text-3xl" />}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Debit Account</p>
            <p className="font-bold text-muted-foreground">
              Payment Method: {transactionSlip?.payment_method}
            </p>
            <p className="font-bold text-muted-foreground">{formattedDate}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {status === "successful" && (
            <IoMdCheckmarkCircle className="text-2xl md:text-3xl" />
          )}

          {status === "pending" && (
            <BsFillDashCircleFill className="text-xl md:text-2xl" />
          )}

          {status === "failed" && <MdCancel className="text-2xl md:text-3xl" />}

          <div className="space-y-2">
            <p className="font-bold">{transactionSlip?.status}</p>
            <p className="font-bold">Top Up</p>
            <p className="font-bold text-muted-foreground">
              Customer Name: {transactionSlip?.full_name}
            </p>
            {qrCodeUrl && status === "successful" && (
              <div className="font-bold text-muted-foreground space-y-2">
                <p>Event Pass:</p>
                <Image src={qrCodeUrl} alt="Qr code" height={100} width={100} />
              </div>
            )}
            <p className="font-bold text-muted-foreground">
              Customer Email: {transactionSlip?.email}
            </p>
            <p className="font-bold text-muted-foreground">{formattedDate}</p>
          </div>
        </div>
      </div>

      <div className="flex md:justify-end">
        <ViewReciptButton />
      </div>
    </div>
  );
}
