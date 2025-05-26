// "use client";

// import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
// import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
// import { type Libraries, useLoadScript } from "@react-google-maps/api";
// import debounce from "lodash.debounce";
// import { useCallback, useEffect, useRef, useState } from "react";
// import { IoLocationOutline } from "react-icons/io5";

// const libraries: Libraries = ["places"];

// type AddressProp = {
//   placeholderText: AutoCompletePlaceholderType;
//   address: AutoCompleteAddressType;
// };

// export default function PostAutoComplete({
//   placeholderText,
//   address,
// }: AddressProp) {
//   const [searchResults, setSearchResults] = useState<
//     google.maps.places.PlacePrediction[]
//   >([]);
//   const [inputValue, setInputValue] = useState("");
//   const sessionTokenRef =
//     useRef<google.maps.places.AutocompleteSessionToken | null>(null);

//   const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
//   if (!googleMapsApiKey) {
//     console.error(
//       "Google Maps API key is missing. Check your .env.local file.",
//     );
//     return <div className="text-red-500">Google Maps API key is missing.</div>;
//   }

//   const { isLoaded } = useLoadScript({
//     googleMapsApiKey,
//     libraries,
//   });

//   useEffect(() => {
//     if (isLoaded && window.google) {
//       sessionTokenRef.current =
//         new google.maps.places.AutocompleteSessionToken();
//     }
//   }, [isLoaded]);

//   const fetchPlacePredictions = async (value: string) => {
//     if (!value.trim() || !window.google || !sessionTokenRef.current) return;

//     try {
//       const { AutocompleteSuggestion } = (await google.maps.importLibrary(
//         "places",
//       )) as google.maps.PlacesLibrary;
//       const request: google.maps.places.AutocompleteRequest = {
//         input: value,
//         sessionToken: sessionTokenRef.current,
//       };

//       const response =
//         await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
//       const suggestions = response.suggestions || [];

//       // Filter out any null predictions and map to PlacePrediction array.
//       const predictions = suggestions
//         .map((suggestion) => suggestion.placePrediction)
//         .filter(
//           (prediction): prediction is google.maps.places.PlacePrediction =>
//             prediction !== null,
//         );

//       setSearchResults(predictions);
//     } catch (error) {
//       console.error("Error fetching autocomplete suggestions:", error);
//     }
//   };

//   // Debounce the API call to avoid excessive calls while typing.
//   const debouncedApiCall = useCallback(
//     debounce(fetchPlacePredictions, 300),
//     [],
//   );

//   const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
//     setInputValue(event.target.value);
//     debouncedApiCall(event.target.value);
//   };

//   const handleSelectPrediction = (description: string) => {
//     address?.address(description);
//     setInputValue(description);
//     setSearchResults([]);
//   };

//   const handleSelectCurrentLocation = () => {
//     if (!navigator.geolocation) {
//       alert("Geolocation is not supported by your browser.");
//       return;
//     }

//     navigator.geolocation.getCurrentPosition(
//       (position) => {
//         const { latitude, longitude } = position.coords;
//         const geocoder = new google.maps.Geocoder();
//         const latlng = { lat: latitude, lng: longitude };

//         geocoder.geocode({ location: latlng }, (results, status) => {
//           if (status === "OK" && results && results.length > 0) {
//             const locationDescription = results[0].formatted_address;
//             address?.address(locationDescription);
//             setInputValue(locationDescription);
//             setSearchResults([]);
//           } else {
//             alert("No address found for your location.");
//           }
//         });
//       },
//       (error) => {
//         console.error("Error getting current location:", error);
//         alert("Unable to retrieve your location.");
//       },
//     );
//   };

//   if (!isLoaded)
//     return (
//       <div className="text-center text-gray-500">Loading Google Maps...</div>
//     );

//   return (
//     <div className="bg-white rounded-lg flex justify-between items-center py-3 md:py-2 gap-2 relative w-full">
//       <input
//         type="text"
//         onChange={handleInputChange}
//         value={inputValue}
//         placeholder={placeholderText.text}
//         className="text-black outline-none w-full"
//       />

//       <IoLocationOutline className="text-2xl" />

//       {searchResults.length > 0 && (
//         <ul className="absolute top-full left-0 w-full h-56 bg-white text-black border rounded shadow-md mt-1 z-10 overflow-y-scroll">
//           <button
//             type="button"
//             onClick={handleSelectCurrentLocation}
//             className="p-2 w-full font-semibold text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
//           >
//             📍 Use my current location
//           </button>

//           {searchResults.map((result) => (
//             <button
//               type="button"
//               key={result.placeId}
//               onClick={() => handleSelectPrediction(result.text.toString())}
//               className="p-2 w-full text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
//             >
//               {result.text.toString()}
//             </button>
//           ))}
//         </ul>
//       )}
//     </div>
//   );
// }

"use client";

import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { useLoadScript } from "@react-google-maps/api";
import debounce from "lodash.debounce";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoLocationOutline } from "react-icons/io5";

const libraries: "places"[] = ["places"];

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
  address: AutoCompleteAddressType;
  classname?: string;
  value?: string;
  onSelectCoordinates?: (location: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
};

export default function PostAutoComplete({
  placeholderText,
  address,
  classname,
  value,
  onSelectCoordinates,
}: AddressProp) {
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const router = useRouter();

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.error("Google Maps API key is missing.");
    return <div className="text-red-500">Google Maps API key is missing.</div>;
  }

  const { isLoaded } = useLoadScript({
    googleMapsApiKey,
    libraries,
  });

  useEffect(() => {
    const fetchUserCountry = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        setCountryCode(data.country_code);
      } catch (error) {
        console.error("Failed to fetch country code:", error);
      }
    };
    fetchUserCountry();
  }, []);

  useEffect(() => {
    if (isLoaded && window.google) {
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      sessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
  }, [isLoaded]);

  // const fetchPlacePredictions = async (input: string) => {
  //   if (
  //     !input.trim() ||
  //     !autocompleteServiceRef.current ||
  //     !sessionTokenRef.current
  //   )
  //     return;

  //   const request: google.maps.places.AutocompleteRequest = {
  //     input,
  //     sessionToken: sessionTokenRef.current,
  //     ...(countryCode && {
  //       componentRestrictions: { country: countryCode },
  //     }),
  //   };

  //   autocompleteServiceRef.current.getPlacePredictions(
  //     request,
  //     (predictions, status) => {
  //       if (
  //         status === google.maps.places.PlacesServiceStatus.OK &&
  //         predictions
  //       ) {
  //         setSearchResults(predictions);
  //       } else {
  //         setSearchResults([]);
  //       }
  //     },
  //   );
  // };

  const fetchPlacePredictionsCallback = useCallback(
    async (input: string) => {
      if (
        !input.trim() ||
        !autocompleteServiceRef.current ||
        !sessionTokenRef.current
      )
        return;

      const request: google.maps.places.AutocompleteRequest = {
        input,
        sessionToken: sessionTokenRef.current,
        ...(countryCode && {
          componentRestrictions: { country: countryCode },
        }),
      };

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (predictions, status) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            setSearchResults(predictions);
          } else {
            setSearchResults([]);
          }
        },
      );
    },
    [countryCode], // This is now correct
  );

  // Then debounce the memoized callback
  const debouncedApiCall = useMemo(
    () => debounce(fetchPlacePredictionsCallback, 300),
    [fetchPlacePredictionsCallback],
  );

  // const debouncedApiCall = useCallback(debounce(fetchPlacePredictions, 300), [
  //   countryCode,
  // ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedApiCall(value);
  };

  const getFormattedPlaceDetails = (
    placeId: string,
  ): Promise<google.maps.places.PlaceResult> => {
    return new Promise((resolve, reject) => {
      const service = new google.maps.places.PlacesService(
        document.createElement("div"),
      );
      service.getDetails({ placeId }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place);
        } else {
          reject("Failed to get place details.");
        }
      });
    });
  };

  const handleSelectPrediction = async (
    description: string,
    mainText: string,
    placeId: string,
  ) => {
    try {
      const place = await getFormattedPlaceDetails(placeId);
      const formattedAddress = place.formatted_address || description;
      const coords = {
        lat: place.geometry?.location?.lat() ?? 0,
        lng: place.geometry?.location?.lng() ?? 0,
      };

      address?.address(mainText);
      setInputValue(mainText);
      setSearchResults([]);
      // localStorage.setItem("address", formattedAddress);
      // localStorage.setItem("coordinates", JSON.stringify(coords));

      onSelectCoordinates?.({ ...coords, address: mainText });
    } catch (error) {
      console.error(error);
      alert("Failed to fetch place details.");
    }
  };

  const handleSelectCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new google.maps.Geocoder();
        const latlng = { lat: latitude, lng: longitude };
        localStorage.setItem("coordinates", JSON.stringify(latlng));

        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const formattedAddress = results[0].formatted_address;
            address?.address(formattedAddress);
            setInputValue(formattedAddress);
            localStorage.setItem("address", formattedAddress);
            setSearchResults([]);
            onSelectCoordinates?.({ ...latlng, address: formattedAddress });
          } else {
            alert("No address found.");
          }
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to retrieve location.");
      },
    );
  };

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  if (!isLoaded)
    return <div className="text-gray-500">Loading Google Maps...</div>;

  return (
    <div className="bg-white rounded-lg flex justify-between items-center py-3 md:py-2 gap-2 relative w-full">
      <input
        type="text"
        onChange={handleInputChange}
        value={inputValue}
        placeholder={placeholderText.text}
        className="text-black outline-none w-full bg-transparent"
      />

      <IoLocationOutline className="text-2xl" />

      {searchResults.length > 0 && (
        <ul className="absolute top-full left-0 w-full max-h-60 bg-white text-black text-lg border rounded shadow-md mt-1 z-10 overflow-y-auto">
          <button
            type="button"
            onClick={handleSelectCurrentLocation}
            className="p-2 w-full text-start font-semibold hover:bg-gray-100 border-b"
          >
            📍 Use my current location
          </button>

          {searchResults.map((result) => (
            <button
              type="button"
              key={result.place_id}
              onClick={() =>
                handleSelectPrediction(
                  result.description,
                  result.structured_formatting.main_text,
                  result.place_id,
                )
              }
              className="p-2 w-full text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
            >
              <div className="font-semibold text-sm text-black">
                {result.structured_formatting.main_text}
              </div>
              <div className="text-xs text-gray-500">
                {result.structured_formatting.secondary_text}
              </div>
            </button>
          ))}
        </ul>
      )}
    </div>
  );
}
