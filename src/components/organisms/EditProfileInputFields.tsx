"use client";

import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import { Button } from "../ui/button";

export default function EditProfileInputFields() {
  const form = useForm();

  const { register } = form;

  return (
    <form className="flex flex-col gap-5">
      <Input
        title="Username"
        inputPlaceholder="Username"
        {...register("username")}
      />

      <Input title="Name" inputPlaceholder="Name" {...register("name")} />

      <Input
        title="Website"
        inputPlaceholder="Website"
        {...register("website")}
      />

      <Input title="Bio" inputPlaceholder="Bio" {...register("bio")} />

      <Button className="self-end font-bold">Submit</Button>
    </form>
  );
}
