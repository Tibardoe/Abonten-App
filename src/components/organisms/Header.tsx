// "use client";

// import { getUserDetails } from "@/actions/getUserDetails";
// import { getUserEventRole } from "@/actions/getUserEventRole";
// import { Button } from "@/components/ui/button";
// import { signOut } from "@/services/authService";
// import Image from "next/image";
// import Link from "next/link";
// import { usePathname, useRouter } from "next/navigation";
// import { useEffect, useMemo, useState } from "react";
// import { GiPartyFlags } from "react-icons/gi";
// import { HiOutlineLogin } from "react-icons/hi";
// import { MdOutlineManageHistory } from "react-icons/md";
// import EventUploadButton from "../atoms/EventUploadButton";
// import UserAvatar from "../atoms/UserAvatar";
// import { cn } from "../lib/utils";
// import AuthPopup from "./AuthPopup";
// import MobileAuthPopup from "./MobileAuthPopup";
// import SideBar from "./SideBar";
// import { useQuery, useQueryClient } from "@tanstack/react-query";
// import { supabase } from "@/config/supabase/client";

// export default function Header() {
//   const [buttonText, setButtonText] = useState("");

//   const [showAuthPopup, setShowAuthPopup] = useState(false);

//   const [isMenuClicked, setIsMenuClicked] = useState(false);

//   const pathname = usePathname();

//   const router = useRouter();

//   const {
//     data: sessionData,
//     isLoading: sessionLoading,
//     error: sessionError,
//   } = useQuery({
//     queryKey: ["session-user-profile"],
//     queryFn: async () => {
//       const { data: userData, error: authError } =
//         await supabase.auth.getUser();

//       if (authError || !userData.user) {
//         console.error("Error fetching session:", authError?.message);
//         return;
//       }

//       const userDetails = await getUserDetails();

//       return {
//         user: userData.user,
//         userDetails,
//       };
//     },
//   });

//   const profile = useMemo(() => {
//     if (sessionData?.userDetails?.status === 200) {
//       return {
//         avatar_public_id: sessionData.userDetails.userDetails?.avatar_public_id,
//         avatar_version: sessionData.userDetails.userDetails?.avatar_version,
//         username: sessionData.userDetails.userDetails?.username,
//       };
//     }
//     return {
//       avatar_public_id: "",
//       avatar_version: "",
//       username: "",
//     };
//   }, [sessionData?.userDetails]);

//   const {
//     data: userRoleData,
//     error: userRoleError,
//     isError: isUserROleError,
//   } = useQuery({
//     queryKey: ["user-role", sessionData?.user?.id],
//     enabled: !!sessionData?.user?.id,
//     queryFn: () => getUserEventRole(sessionData?.user?.id ?? ""),
//   });

//   const userRole = Array.isArray(userRoleData?.role) ? userRoleData.role : [];

//   const isUserAccount = pathname === `/user/${profile.username}/posts`;

//   const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
//     const text = (event.target as HTMLButtonElement).innerText;
//     setButtonText(text);

//     setShowAuthPopup((prevState) => !prevState);
//   };

//   const handleSignOut = async () => {
//     try {
//       await signOut();
//       router.push("/");
//     } catch (error) {
//       console.error("Error signing out:", error);
//     }
//   };

//   const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

//   const defaultAvatar = "AnonymousProfile_rn6qez";

//   const avatarUrl = profile.avatar_public_id
//     ? `${cloudinaryBaseUrl}v${profile.avatar_version}/${profile.avatar_public_id}.jpg`
//     : defaultAvatar;

//   const handleMenuClicked = () => {
//     setIsMenuClicked((prevState) => !prevState);
//   };

//   const isOrganizer = userRole.includes("organizer");

//   const isAttendee = userRole.includes("attendee");

//   return (
//     <nav className="w-full flex justify-center fixed bg-white z-30">
//       {showAuthPopup && (
//         <>
//           <AuthPopup
//             buttonText={buttonText}
//             onClose={() => setShowAuthPopup(false)}
//           />
//           <MobileAuthPopup
//             buttonText={buttonText}
//             onClose={() => setShowAuthPopup(false)}
//           />
//         </>
//       )}

//       {isMenuClicked && <SideBar menuClicked={isMenuClicked} />}

//       <div className="flex justify-between py-5 w-[90%] md:w-[80%] border-b border-black-500 items-center">
//         <div className="mx-auto lg:mx-0 flex items-center w-full">
//           {/* Menu button on small devices */}
//           {isMenuClicked ? (
//             <div className="w-[30px] h-[30px] md:w-[40px] md:h-[40px] flex items-center justify-center">
//               <button
//                 onClick={handleMenuClicked}
//                 type="button"
//                 className="lg:hidden w-[20px] h-[20px] md:w-[25px] md:h-[25px]"
//               >
//                 <Image
//                   src="/assets/images/cancel.svg"
//                   alt="Menu icon"
//                   width={40}
//                   height={40}
//                 />
//               </button>
//             </div>
//           ) : (
//             <button
//               type="button"
//               onClick={handleMenuClicked}
//               className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
//             >
//               <Image
//                 src="/assets/images/menu.svg"
//                 alt="Menu icon"
//                 width={40}
//                 height={40}
//               />
//             </button>
//           )}

//           <Link
//             href="/"
//             className="absolute left-1/2 transform -translate-x-1/2 lg:static lg:translate-x-0"
//           >
//             <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
//           </Link>
//         </div>

//         {sessionData?.user ? (
//           <div className="hidden lg:flex items-center gap-7 min-w-fit">
//             {isOrganizer && (
//               <Link
//                 href="/manage/attendance/event-list"
//                 className="flex gap-1 items-center"
//               >
//                 <MdOutlineManageHistory className="text-2xl" />
//                 Manage Attendance
//               </Link>
//             )}

//             {isAttendee && (
//               <Link
//                 href="/manage/my-events"
//                 className="flex gap-1 items-center"
//               >
//                 <GiPartyFlags className="text-2xl" />
//                 My Events
//               </Link>
//             )}

//             <EventUploadButton />

//             <button
//               type="button"
//               onClick={handleSignOut}
//               className="flex gap-1 items-center"
//             >
//               <HiOutlineLogin className="text-3xl opacity-70" />
//               SignOut
//             </button>

//             {profile.username && (
//               <Link
//                 href={`/user/${profile.username}/posts`}
//                 className={cn(
//                   "bg-transparent rounded-full font-bold border-black",
//                   { hidden: isUserAccount }
//                 )}
//               >
//                 <UserAvatar avatarUrl={avatarUrl} width={60} height={60} />
//               </Link>
//             )}
//           </div>
//         ) : (
//           <div className="space-x-5 hidden lg:flex">
//             <Button
//               variant="outline"
//               className="bg-transparent rounded-full font-bold border-black"
//               onClick={handleClick}
//             >
//               Sign Up
//             </Button>
//             <Button
//               variant="outline"
//               className="bg-transparent rounded-full font-bold border-black"
//               onClick={handleClick}
//             >
//               Sign In
//             </Button>
//           </div>
//         )}
//       </div>
//     </nav>
//   );
// }

"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { getUserEventRole } from "@/actions/getUserEventRole";
import { Button } from "@/components/ui/button";
import { supabase } from "@/config/supabase/client";
import { signOut } from "@/services/authService";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { HiOutlineLogin } from "react-icons/hi";
import { MdOutlineManageHistory } from "react-icons/md";
import EventUploadButton from "../atoms/EventUploadButton";
import UserAvatar from "../atoms/UserAvatar";
import { cn } from "../lib/utils";
import AuthPopup from "./AuthPopup";
import MobileAuthPopup from "./MobileAuthPopup";
import SideBar from "./SideBar";

const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/abonten/image/upload/";
const DEFAULT_AVATAR = "AnonymousProfile_rn6qez";

export default function Header() {
  const [authType, setAuthType] = useState<"Sign Up" | "Sign In" | "">("");
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [isMenuClicked, setIsMenuClicked] = useState(false);

  const pathname = usePathname();

  // Query for user session
  const {
    data: userSession,
    // isLoading: sessionLoading,
    // error: sessionError,
  } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error(error?.message || "No user");
      return data.user;
    },
  });

  // Query for user details
  const {
    data: userDetails,
    // isLoading: detailsLoading
  } = useQuery({
    queryKey: ["user-details", userSession?.id],
    enabled: !!userSession?.id,
    queryFn: async () => {
      const details = await getUserDetails();
      return details?.status === 200 ? details.userDetails : null;
    },
  });

  // Query for user role
  const { data: userRole } = useQuery({
    queryKey: ["user-role", userSession?.id],
    enabled: !!userSession?.id,
    queryFn: () => getUserEventRole(userSession?.id ?? ""),
  });

  const profile = {
    username: userDetails?.username ?? "",
    avatar_public_id: userDetails?.avatar_public_id ?? "",
    avatar_version: userDetails?.avatar_version ?? "",
  };

  const avatarUrl = profile.avatar_public_id
    ? `${CLOUDINARY_BASE_URL}v${profile.avatar_version}/${profile.avatar_public_id}.jpg`
    : DEFAULT_AVATAR;

  const isUserAccount = pathname === `/user/${profile.username}/posts`;
  const isOrganizer = userRole?.role?.includes("organizer");
  const isAttendee = userRole?.role?.includes("attendee");

  const handleClick = (type: "Sign Up" | "Sign In") => {
    setAuthType(type);
    setShowAuthPopup(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuClicked((prev) => !prev);
  };

  return (
    <nav className="w-full flex justify-center fixed bg-white z-30">
      {showAuthPopup && (
        <>
          <AuthPopup
            buttonText={authType}
            onClose={() => setShowAuthPopup(false)}
          />
          <MobileAuthPopup
            buttonText={authType}
            onClose={() => setShowAuthPopup(false)}
          />
        </>
      )}

      {isMenuClicked && <SideBar menuClicked={isMenuClicked} />}

      <div className="flex justify-between py-5 w-[95%] border-b border-black-500 items-center">
        <div className="mx-auto lg:mx-0 flex items-center w-full">
          {/* Menu toggle button */}
          <button
            type="button"
            onClick={toggleMenu}
            className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
          >
            <Image
              src={
                isMenuClicked
                  ? "/assets/images/cancel.svg"
                  : "/assets/images/menu.svg"
              }
              alt="Menu icon"
              width={40}
              height={40}
            />
          </button>

          <Link
            href="/"
            className="absolute left-1/2 transform -translate-x-1/2 lg:static lg:translate-x-0"
          >
            <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
          </Link>
        </div>

        {userSession ? (
          <div className="hidden lg:flex items-center gap-7 min-w-fit">
            {isOrganizer && (
              <Link
                href="/manage/attendance/event-list"
                className="flex gap-1 items-center"
              >
                <MdOutlineManageHistory className="text-2xl" />
                Manage Attendance
              </Link>
            )}
            {isAttendee && (
              <Link
                href="/manage/my-events"
                className="flex gap-1 items-center"
              >
                <GiPartyFlags className="text-2xl" />
                My Events
              </Link>
            )}

            <EventUploadButton />

            <button
              type="button"
              onClick={handleSignOut}
              className="flex gap-1 items-center"
            >
              <HiOutlineLogin className="text-3xl opacity-70" />
              SignOut
            </button>

            {profile.username && (
              <Link
                href={`/user/${profile.username}/posts`}
                className={cn(
                  "bg-transparent rounded-full font-bold border-black",
                  { hidden: isUserAccount },
                )}
              >
                <UserAvatar avatarUrl={avatarUrl} width={60} height={60} />
              </Link>
            )}
          </div>
        ) : (
          <div className="space-x-5 hidden lg:flex">
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold border-black"
              onClick={() => handleClick("Sign Up")}
            >
              Sign Up
            </Button>
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold border-black"
              onClick={() => handleClick("Sign In")}
            >
              Sign In
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
