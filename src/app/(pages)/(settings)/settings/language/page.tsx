import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import { languages } from "@/data/languages";
import Link from "next/link";

export default async function page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Language" />
      {/* Language */}

      <ul className="flex flex-col space-y-5 mb-5">
        {languages.map(({ code, name }) => (
          <Link
            key={code}
            href={`/${code}`}
            prefetch={false}
            className="flex items-center justify-between md:text-lg"
          >
            <span>{name}</span>

            <input
              type="radio"
              name="language"
              value={code}
              checked={locale === code}
              readOnly
              className="accent-green-500 w-5 h-5" // nice radio color
            />

            {/* <button
              type="button"
              disabled={locale === code}
              className="flex items-center justify-between space-x-2 px-4 py-2 rounded-md hover:bg-gray-100"
            >
              <input
                type="radio"
                name="language"
                value={code}
                checked={locale === code}
                readOnly
                className="accent-green-500" // nice radio color
              />
              <span>{name}</span>
            </button> */}
          </Link>
        ))}
      </ul>
    </div>
  );
}
