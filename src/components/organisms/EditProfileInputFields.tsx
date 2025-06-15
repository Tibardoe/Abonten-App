"use client";

import { updateUserDetails } from "@/actions/updateUserDetails";
import type { UserDetailsFormType } from "@/types/userProfileType";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import Notification from "../atoms/Notification";
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

  const [notification, setNotification] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: updateUserDetails,
    onSuccess: (profileData) => {
      setNotification(profileData?.message || "Profile updated successfully.");
    },
    onError: (error) => {
      setNotification(error?.message || "Something went wrong.");
    },
    onSettled: () => {
      setTimeout(() => {
        setNotification(null);
      }, 3000);
    },
  });

  const onSubmit = (data: UserDetailsFormType) => {
    mutate(data);
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Input
          title="Username"
          inputPlaceholder="Username"
          {...register("username")}
        />

        <Input
          title="Name"
          inputPlaceholder="Name"
          {...register("full_name")}
        />

        <Input
          title="Website"
          inputPlaceholder="Website"
          {...register("website")}
        />

        <Input title="Bio" inputPlaceholder="Bio" {...register("bio")} />

        <Button
          className="self-end font-bold mb-5 md:mb-0"
          disabled={isPending}
        >
          {isPending ? "Submitting..." : "Submit"}
        </Button>
      </form>

      <Notification notification={notification} />
    </>
  );
}
