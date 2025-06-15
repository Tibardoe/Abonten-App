type CountryAPIResponse = {
  name: { common: string };
  idd: { root: string; suffixes?: string[] };
  flags: { svg: string };
};

export const fetchCountries = async () => {
  try {
    const res = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,idd,flags",
    );

    const data: CountryAPIResponse[] = await res.json();

    return data.map((country) => ({
      name: country.name.common,
      dialCode: `${country.idd.root}${country.idd.suffixes?.[0] || ""}`,
      flag: country.flags.svg,
    }));
  } catch (error) {
    console.error("Error fetching countries:", error);
    return [];
  }
};
