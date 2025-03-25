import { useState } from "react";
import Input from "../atoms/Input";

export default function EditProfileInputFields() {
  const [value, setValue] = useState("");

  const handleChange = (string: string) => {
    setValue(string);
  };

  return (
    <div>
      <Input
        title="Username"
        inputPlaceholder="Username"
        value={value}
        onchange={handleChange}
      />
    </div>
  );
}
