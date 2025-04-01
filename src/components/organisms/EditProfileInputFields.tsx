"use client";

import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import { Button } from "../ui/button";

type FormValues = {
  username: string;
  full_name: string;
  avatar_public_id: string;
  avatar_version: string;
  bio: string;
  website: string;
};

type InitialDataProps = {
  initialData: {
    id: string;
    status: number;
    username: string;
    full_name: string;
    avatar_public_id: string;
    avatar_version: string;
    bio: string;
  };
};

export default function EditProfileInputFields({
  initialData,
}: InitialDataProps) {
  const form = useForm<FormValues>({ defaultValues: initialData });

  const { register, handleSubmit } = form;

  return (
    <form
      onSubmit={handleSubmit((data) => console.log(data))}
      className="flex flex-col gap-5"
    >
      <Input
        title="Username"
        inputPlaceholder="Username"
        {...register("username")}
      />

      <Input title="Name" inputPlaceholder="Name" {...register("full_name")} />

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
