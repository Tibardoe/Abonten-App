"use client";

import { AnimatePresence, motion } from "framer-motion";

type NotificationProps = {
  notification: string | null;
};

// Matches an emoji already leading the message (e.g. "✅ ..." / "❌ ...")
// so this component doesn't stack its own ⚠️ on top of one a caller supplied.
const LEADING_EMOJI = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export default function Notification({ notification }: NotificationProps) {
  const hasOwnIcon = notification !== null && LEADING_EMOJI.test(notification);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.4 }}
          className="fixed bottom-24 md:bottom-10 right-[5%] z-30 md:right-[10%] bg-black text-white p-4 rounded-lg shadow-lg flex items-center justify-center w-80"
        >
          {hasOwnIcon ? notification : `⚠️ ${notification}`}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
