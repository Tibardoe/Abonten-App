"use client";

import type { UserDetailsFormType } from "@/types/userProfileType";
import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import { Button } from "../ui/button";

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
  const form = useForm<UserDetailsFormType>({ defaultValues: initialData });

  const { register, handleSubmit } = form;

  const onSubmit = (data: UserDetailsFormType) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
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
