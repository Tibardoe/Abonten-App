type InputBoxProp = {
  title: string;
  value: string;
  placeholder: string;
};

export default function InputBox({ title, value, placeholder }: InputBoxProp) {
  return (
    <div>
      <h2 className="font-bold text-xl">{title}</h2>

      <div className="rounded-md border border-black border-opacity-40 bg-white text-black p-4 flex justify-between w-full">
        <input
          className="bg-transparent outline-none w-full"
          type="text"
          disabled
          placeholder={placeholder}
          value={value}
        />

        {title === "phone" && <button type="button">Edit</button>}

        {title === "email" && <button type="button">Edit</button>}
      </div>
    </div>
  );
}
