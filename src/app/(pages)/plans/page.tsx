"use client";

import PlanContainer from "@/components/molecules/PlanContainer";
import Link from "next/link";
import { useState } from "react";

export default function page() {
  const [activeSubscription, setActiveSubscription] = useState("Daily");

  return (
    <div className="space-y-3">
      <h1 className="font-semibold text-xl md:text-2xl">Change plan</h1>
      <div className="flex flex-col gap-5">
        <PlanContainer
          subscriptionName="Daily"
          subscriptionDetails="Post 2 flyers for a day, unlimited story  post for a day. 24hours after events to post event highlight, post last for a day."
          subscriptionPrice="GHS 5/day"
          activeSubscription={activeSubscription}
          setActiveSubscription={setActiveSubscription}
        />

        <PlanContainer
          subscriptionName="Weekly"
          subscriptionDetails="Post 5 flyers for a week, unlimited story  post for week. 3days after events to post event highlight, post last for a week."
          subscriptionPrice="GHS 25/day"
          activeSubscription={activeSubscription}
          setActiveSubscription={setActiveSubscription}
        />

        <PlanContainer
          subscriptionName="Monthly"
          subscriptionDetails="Post 10 flyers for a month, unlimited story  post for a month. 1 week after events to post event highlight, post last for a month."
          subscriptionPrice="GHS 75/day"
          activeSubscription={activeSubscription}
          setActiveSubscription={setActiveSubscription}
        />

        <PlanContainer
          subscriptionName="Unlimited"
          subscriptionDetails="Post unlimited flyers, unlimited stories. Post highlight of past events anytime. Post last forever."
          subscriptionPrice="GHS 120/day"
          activeSubscription={activeSubscription}
          setActiveSubscription={setActiveSubscription}
        />

        <div className="flex gap-5 self-center mb-10">
          <button
            type="button"
            className="font-bold border border-black rounded-md text-lg py-1 px-5"
            onClick={() => window.history.back()}
          >
            Back
          </button>

          <Link
            href="/wallet"
            type="button"
            className="font-bold bg-black rounded-md text-lg py-1 px-5 text-white"
          >
            Continue
          </Link>
        </div>
      </div>
    </div>
  );
}
