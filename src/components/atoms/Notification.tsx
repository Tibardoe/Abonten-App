import { AnimatePresence, motion } from "framer-motion";

type NotificationProps = {
  notification: string | null;
};

export default function Notification({ notification }: NotificationProps) {
  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.4 }}
          className="fixed bottom-24 md:bottom-10 right-[5%] z-10 md:right-[10%] bg-black text-white p-4 rounded-lg shadow-lg flex items-center justify-center w-80"
        >
          ⚠️ {notification}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
