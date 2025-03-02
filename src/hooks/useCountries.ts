import { fetchCountries } from "@/services/restCountriesApi";
import { useEffect, useState } from "react";

type Country = {
  name: string;
  dialCode: string;
  flag: string;
};

export const useCountries = () => {
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    const getCountries = async () => {
      const countryData = await fetchCountries();
      setCountries(countryData || []);
    };

    getCountries();
  }, []);

  return countries;
};
