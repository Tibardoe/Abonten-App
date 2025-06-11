"use server";

export default async function issueRefund(transaction: string) {
  console.log("refunded", transaction);

  return { status: 200, message: "Refund successfull" };
}
