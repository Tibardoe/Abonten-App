"use client";

import insertSubscriptionCheckout from "@/actions/insertSubscriptionCheckout";
import PlanContainer from "@/components/molecules/PlanContainer";
import { plans } from "@/data/plans";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Notification from "../atoms/Notification";

export default function SubscriptionPlans() {
  const [activeSubscription, setActiveSubscription] = useState<string | null>(
    null,
  );

  const [notification, setNotification] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubscriptionCheckout = async () => {
    setLoading(true);

    if (!activeSubscription) {
      setNotification("Select a plan package before you can proceed!");
      setLoading(false);
      return;
    }

    const res = await insertSubscriptionCheckout(activeSubscription);

    if (res.status !== 200 && res.message) {
      setNotification(res.message);
      setLoading(false);
      return;
    }

    const id = res.data?.id;

    router.push(`/wallet/${id}?&type=subscription`);
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div className="space-y-3">
      <h1 className="font-semibold text-xl md:text-2xl">Change plan</h1>
      <div className="flex flex-col gap-5">
        {plans.map((plan) => (
          <PlanContainer
            key={plan.name}
            subscriptionName={plan.name}
            subscriptionDetails={plan.details}
            subscriptionPrice={plan.price}
            activeSubscription={activeSubscription}
            setActiveSubscription={setActiveSubscription}
          />
        ))}

        <div className="flex gap-5 self-center mb-10">
          <button
            type="button"
            className="font-bold border border-mint rounded-md text-lg py-1 px-5"
            onClick={() => window.history.back()}
          >
            Back
          </button>

          <button
            type="button"
            onClick={handleSubscriptionCheckout}
            disabled={loading}
            className="font-bold bg-mint rounded-md text-lg py-1 px-5 text-white"
          >
            {loading ? "Please wait" : "Continue"}
          </button>
        </div>

        {notification && <Notification notification={notification} />}
      </div>
    </div>
  );
}
