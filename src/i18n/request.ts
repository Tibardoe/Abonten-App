import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

const namespaces = [
  "common",
  "navigation",
  "auth",
  "settings",
  "events",
] as const;

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  const messages = Object.fromEntries(
    await Promise.all(
      namespaces.map(async (namespace) => [
        namespace,
        (await import(`../../messages/${locale}/${namespace}.json`)).default,
      ]),
    ),
  );

  return { locale, messages };
});
