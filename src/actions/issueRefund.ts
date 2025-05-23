"use server";

export default async function issueRefund(transaction) {
  console.log("refunded");

  return { status: 200, message: "Refund successfull" };
}
