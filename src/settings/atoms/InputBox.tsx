type InputBoxProp = {
  title: string;
  value: string;
  placeholder: string;
};

export default function InputBox({ title, value, placeholder }: InputBoxProp) {
  return (
    <div>
      <h2 className="font-bold text-xl">{title}</h2>

      <div className="flex w-full items-center justify-between rounded-md border border-input bg-background p-4 text-foreground shadow-sm opacity-70">
        <input
          className="w-full cursor-not-allowed bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
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
