type inputProp = {
  inputPlaceholder: string;
};

export default function Input({ inputPlaceholder }: inputProp) {
  return (
    <input
      type="text"
      placeholder={inputPlaceholder}
      className="bg-transparent outline-none text-xl"
    />
  );
}
