"use client";

import React, { useState } from "react";
import { Button } from "../ui/button";

import { useParams } from "next/navigation";
import RecieptModal from "../organisms/RecieptModal";

export default function ViewReciptButton() {
  const [showReciept, setShowReciept] = useState(false);

  const { transactionId } = useParams();

  const handleShowReceipt = (state: boolean) => {
    setShowReciept(state);
  };

  return (
    <>
      {showReciept && (
        <RecieptModal
          handleShowReceipt={handleShowReceipt}
          transactionId={transactionId as string}
        />
      )}

      <Button
        variant={"outline"}
        onClick={() => handleShowReceipt(true)}
        className="text-sm font-bold rounded-full border border-black w-full md:w-fit p-6"
      >
        View Receipt
      </Button>
    </>
  );
}
