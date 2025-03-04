import MobileFooter from "./MobileFooter";

export default function SideBar() {
  return (
    <div className="bg-black bg-opacity-50 w-full z-10 flex lg:hidden fixed left-0 h-[100%]">
      <div className="bg-white z-30 w-[80%] left-0 relative">
        <div className="pl-[5%] md:pl-[10%] flex flex-col items-start gap-3 text-lg font-bold">
          <button type="button">Login</button>
          <button type="button">Sign up</button>
        </div>

        <MobileFooter />
      </div>
    </div>
  );
}
