// import { useForm } from "react-hook-form";
// import { z } from "zod";
// import { zodResolver } from "@hookform/resolvers/zod";
// import Image from "next/image";
// import { useState } from "react";
// import { cn } from "../lib/utils";
// import { networks } from "@/utils/networkProviderData";

// export const receivingAccountSchema = z.object({
//   name: z
//     .string()
//     .min(2, "Name must be at least 2 characters")
//     .max(100, "Name must be under 100 characters")
//     .regex(
//       /^[a-zA-Z\s'-]+$/,
//       "Name can only contain letters, spaces, apostrophes, or hyphens"
//     ),

//   email: z.string().email("Invalid email address"),

//   phone: z
//     .string()
//     .min(10, "Phone number must be at least 10 digits")
//     .max(15, "Phone number must be no more than 15 digits")
//     .regex(
//       /^\+?[0-9]{10,15}$/,
//       "Phone number must be digits and can start with '+'"
//     ),

//   bankAccountNumber: z
//     .string()
//     .min(8, "Account number must be at least 8 digits")
//     .max(20, "Account number must be no more than 20 digits")
//     .regex(/^[0-9]+$/, "Bank account number must contain only digits"),

//   bankName: z
//     .string()
//     .trim()
//     .min(2, { message: "Bank name must be at least 2 characters" })
//     .max(100, { message: "Bank name must be under 100 characters" }),

//   branch: z
//     .string()
//     .trim()
//     .max(100, { message: "Branch name must be under 100 characters" })
//     .optional(),
// });

// export default function ReceivingAccountForms() {
//   const [showDropdown, setShowDropdown] = useState(false);

//   const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);

//   const [paymentOption, setPaymentOption] = useState<string | null>(null);

//   const handlePaymentOption = (option: string) => {
//     setPaymentOption(option);
//   };

//   const handleSelectedNetwork = (network: string) => {
//     setSelectedNetwork(network);
//     handleDropdown();
//   };

//   const form = useForm<z.infer<typeof receivingAccountSchema>>({
//     resolver: zodResolver(receivingAccountSchema),
//   });

//   const {
//     register,
//     handleSubmit,
//     formState: { errors },
//   } = form;

//   const handleDropdown = () => {
//     setShowDropdown((prevState) => !prevState);
//   };

//   return (
//     <div className="space-y-3">
//       <h1 className="font-semibold text-slate-700">
//         Ticket Purchases Receiving Account
//       </h1>

//       <div className="flex justify-between gap-2 items-center">
//         <div className="flex flex-col gap-2 w-full">
//           <div className="bg-white border border-black rounded-md">
//             <input
//               type="text"
//               placeholder="Full name"
//               className="bg-transparent w-full outline-black rounded-md p-2"
//               {...register("name")}
//             />
//           </div>

//           {errors.name && (
//             <p className="text-red-500 text-sm">{errors.name.message}</p>
//           )}
//         </div>

//         <div className="flex flex-col gap-2 w-full">
//           <div className="bg-white border border-black rounded-md">
//             <input
//               type="text"
//               placeholder="Email"
//               className="bg-transparent w-full outline-black rounded-md p-2"
//               {...register("email")}
//             />
//           </div>

//           {errors.name && (
//             <p className="text-red-500 text-sm">{errors.name.message}</p>
//           )}
//         </div>
//       </div>

//       <div className="flex flex-col gap-2">
//         <div className="space-y-2">
//           <button
//             type="button"
//             onClick={() => handlePaymentOption("Mobile Money")}
//             className="flex justify-between items-center w-full text-sm font-semibold text-slate-700"
//           >
//             Mobile Money
//             <span className="w-[14px] h-[14px] rounded-full grid place-items-center border border-black">
//               <span
//                 className={cn("bg-black w-[6px] h-[6px] rounded-full", {
//                   hidden: paymentOption !== "Mobile Money",
//                   flex: paymentOption === "Mobile Money",
//                 })}
//               />
//             </span>
//           </button>

//           {paymentOption === "Mobile Money" && (
//             <div>
//               <div className="flex flex-col gap-2 mb-3">
//                 <button
//                   type="button"
//                   onClick={handleDropdown}
//                   className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-transparent flex justify-between items-center"
//                 >
//                   {selectedNetwork ? (
//                     <p>{selectedNetwork}</p>
//                   ) : (
//                     <p>Select mobile network</p>
//                   )}

//                   <Image
//                     src="/assets/images/arrowDown.svg"
//                     alt="Dropdown icon"
//                     width={30}
//                     height={30}
//                   />
//                 </button>

//                 <div className="flex flex-col gap-2">
//                   <div className="bg-white border w-full border-black rounded-md">
//                     <input
//                       type="tel"
//                       placeholder="Phone number"
//                       className="bg-transparent w-full outline-black rounded-md p-2"
//                       {...register("phone")}
//                     />
//                   </div>

//                   {errors.phone && (
//                     <p className="text-red-500 text-sm">
//                       {errors.phone.message}
//                     </p>
//                   )}
//                 </div>

//                 {showDropdown && (
//                   <ul className="flex flex-col gap-3 shadow-xl h-64 p-3 overflow-y-scroll rounded-xl">
//                     {networks.map((network) => (
//                       <button
//                         type="button"
//                         key={network.network}
//                         onClick={() => handleSelectedNetwork(network.network)}
//                         className="flex gap-2 justify-start items-center border-b border-black border-opacity-30 py-3"
//                       >
//                         <Image
//                           src={network.logo}
//                           alt={network.network}
//                           width={50}
//                           height={50}
//                         />
//                         {network.network}
//                       </button>
//                     ))}
//                   </ul>
//                 )}
//               </div>
//             </div>
//           )}
//         </div>

//         <div className="space-y-2">
//           <button
//             type="button"
//             onClick={() => handlePaymentOption("Bank")}
//             className="flex justify-between items-center w-full text-sm font-semibold text-slate-700"
//           >
//             Bank
//             <span className="w-[14px] h-[14px] rounded-full grid place-items-center border border-black">
//               <span
//                 className={cn("bg-black w-[6px] h-[6px] rounded-full", {
//                   hidden: paymentOption !== "Bank",
//                   flex: paymentOption === "Bank",
//                 })}
//               />
//             </span>
//           </button>

//           {paymentOption === "Bank" && (
//             <div className="space-y-2">
//               <div className="flex justify-between gap-2 items-center">
//                 <div className="flex flex-col gap-2 w-full">
//                   <div className="bg-white border w-full border-black rounded-md">
//                     <input
//                       type="text"
//                       placeholder="Bank name"
//                       className="bg-transparent w-full outline-black rounded-md p-2"
//                       {...register("bankName")}
//                     />
//                   </div>

//                   {errors.bankName && (
//                     <p className="text-red-500 text-sm">
//                       {errors.bankName.message}
//                     </p>
//                   )}
//                 </div>

//                 <div className="flex flex-col gap-2 w-full">
//                   <div className="bg-white border w-full border-black rounded-md">
//                     <input
//                       type="text"
//                       placeholder="Bank branch"
//                       className="bg-transparent w-full outline-black rounded-md p-2"
//                       {...register("branch")}
//                     />
//                   </div>

//                   {errors.branch && (
//                     <p className="text-red-500 text-sm">
//                       {errors.branch.message}
//                     </p>
//                   )}
//                 </div>
//               </div>

//               <div className="flex flex-col gap-2 w-full">
//                 <div className="bg-white border w-full border-black rounded-md">
//                   <input
//                     type="number"
//                     placeholder="Account number"
//                     className="bg-transparent w-full outline-black rounded-md p-2"
//                     {...register("bankAccountNumber")}
//                   />
//                 </div>
//               </div>

//               {errors.bankAccountNumber && (
//                 <p className="text-red-500 text-sm">
//                   {errors.bankAccountNumber.message}
//                 </p>
//               )}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

import { networks } from "@/utils/networkProviderData";
import type { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useState } from "react";
import type { useForm } from "react-hook-form";
import type { z } from "zod";
import { cn } from "../lib/utils";

type ReceivingAccountType = {
  form: ReturnType<typeof useForm<z.infer<typeof receivingAccountSchema>>>;
  handlePaymentOption: (option: string) => void;
  paymentOption: string | null;
  selectedNetwork: string | null;
  handleSelectedNetwork: (network: string) => void;
  setShowNetworkDropdown: (state: boolean) => void;
  showNetworkDropdown: boolean;
};

export default function ReceivingAccountForms({
  handlePaymentOption,
  paymentOption,
  selectedNetwork,
  handleSelectedNetwork,
  setShowNetworkDropdown,
  showNetworkDropdown,
  form,
}: ReceivingAccountType) {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = form;

  const renderError = (error?: { message?: string }) =>
    error && (
      <p className="text-red-500 text-xs italic mt-1">{error.message}</p>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h2 className="font-bold text-gray-800">Receiving Account Details</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <input
            {...register("name")}
            placeholder="Full Name"
            className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
          />
          {renderError(errors.name)}
        </div>
        <div>
          <input
            {...register("email")}
            placeholder="Email"
            className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
          />
          {renderError(errors.email)}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm text-gray-700">
            Select Payment Option
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {["Mobile Money", "Bank"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handlePaymentOption(option)}
              className={cn(
                "py-2 px-4 rounded-md border text-sm font-semibold",
                paymentOption === option
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-300",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {paymentOption === "Mobile Money" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowNetworkDropdown(!selectedNetwork)}
              className="w-full border px-4 py-2 rounded-md flex justify-between items-center text-sm text-gray-700"
            >
              {selectedNetwork || "Select Mobile Network"}
              <Image
                src="/assets/images/arrowDown.svg"
                alt="Dropdown"
                width={20}
                height={20}
              />
            </button>
            {showNetworkDropdown && (
              <ul className="max-h-60 overflow-y-auto border rounded-md shadow bg-white divide-y">
                {networks.map((network) => (
                  <li key={network.network}>
                    <button
                      type="button"
                      onClick={() => handleSelectedNetwork(network.network)}
                      className="w-full flex items-center px-4 py-2 hover:bg-gray-100 text-sm"
                    >
                      <Image
                        src={network.logo}
                        alt={network.network}
                        width={24}
                        height={24}
                        className="mr-2"
                      />
                      {network.network}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <input
                {...register("phone")}
                placeholder="Phone Number"
                className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
              />
              {renderError(errors.phone)}
            </div>
          </div>
        )}

        {paymentOption === "Bank" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input
                  {...register("bankName")}
                  placeholder="Bank Name"
                  className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
                />
                {renderError(errors.bankName)}
              </div>
              <div>
                <input
                  {...register("branch")}
                  placeholder="Bank Branch"
                  className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
                />
                {renderError(errors.branch)}
              </div>
            </div>
            <div>
              <input
                {...register("bankAccountNumber")}
                placeholder="Account Number"
                type="number"
                className="w-full border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring focus:ring-black"
              />
              {renderError(errors.bankAccountNumber)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
