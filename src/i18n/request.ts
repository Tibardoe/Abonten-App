import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  const messages = await loadMessages(locale);

  return { locale, messages };
});
