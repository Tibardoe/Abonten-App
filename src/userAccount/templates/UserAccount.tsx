import ProfileDetails from "../organisms/ProfileDetails";

export default function UserAccount() {
  return (
    <div className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32 min-h-[80%]">
      <div className="flex flex-col">
        <ProfileDetails />
      </div>
    </div>
  );
}
