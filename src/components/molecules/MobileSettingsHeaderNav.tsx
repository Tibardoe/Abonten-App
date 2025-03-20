import BackButton from "../atoms/BackButton";

type titleProp = {
  title: string;
};

export default function MobileSettingsHeaderNav({ title }: titleProp) {
  return (
    <div className="flex items-center w-full">
      <BackButton />

      <p className="mx-auto font-bold text-2xl">{title}</p>
    </div>
  );
}
