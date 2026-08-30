"use client";

import { updateUserDetails } from "@/actions/updateUserDetails";
import { useToast } from "@/hooks/useToast";
import type { UserDetailsFormType } from "@abonten/types/userProfileType";
import { editProfileSchema } from "@abonten/validation/editProfileSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
    website: string;
  };
};

export default function EditProfileInputFields({
  initialData,
}: InitialDataProps) {
  const form = useForm<UserDetailsFormType>({
    defaultValues: initialData,
    resolver: zodResolver(editProfileSchema),
    mode: "onBlur",
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isValid },
  } = form;

  const toast = useToast();
  const queryClient = useQueryClient();

  const userDetailsQueryKey = ["user-details", initialData.id];

  const { mutate, isPending } = useMutation({
    mutationFn: updateUserDetails,

    // Profile text fields are low-risk and easily reversible, so
    // Header/SideBar/MobileNavBar (all sharing this cache entry) show the
    // new username/name immediately instead of waiting on the round trip.
    onMutate: async (formData) => {
      await queryClient.cancelQueries({ queryKey: userDetailsQueryKey });

      const previousDetails =
        queryClient.getQueryData<Record<string, unknown>>(userDetailsQueryKey);

      queryClient.setQueryData<Record<string, unknown>>(
        userDetailsQueryKey,
        (old) => (old ? { ...old, ...formData } : old),
      );

      return { previousDetails };
    },

    // updateUserDetails never throws (see the action) — it returns
    // {status, message} even on failure, so a rejected update is handled
    // here rather than in onError below.
    onSuccess: (profileData, formData, context) => {
      const message = profileData?.message || "Profile updated successfully.";

      if (profileData?.status === 200) {
        toast.success(message);
        // Re-baseline the form against what was just saved, so isDirty
        // (and therefore the Save button/"Unsaved changes" hint) reflects
        // that there's nothing left to save.
        form.reset(formData);
      } else {
        toast.error(message);
      }

      if (profileData?.status !== 200 && context?.previousDetails) {
        queryClient.setQueryData(userDetailsQueryKey, context.previousDetails);
      }

      // Header/SideBar/MobileNavBar all read this shared cache entry for the
      // displayed username/avatar — without this it stays stale for up to
      // its 60s staleTime.
      queryClient.invalidateQueries({ queryKey: userDetailsQueryKey });
      // Username customization (and full_name) feed into profile
      // completion — keep the checklist/indicator in sync immediately.
      queryClient.invalidateQueries({
        queryKey: ["profile-completion", initialData.id],
      });
    },

    onError: (error, _formData, context) => {
      if (context?.previousDetails) {
        queryClient.setQueryData(userDetailsQueryKey, context.previousDetails);
      }
      toast.error(error?.message || "Something went wrong.");
    },
  });

  const onSubmit = (data: UserDetailsFormType) => {
    mutate(data);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-semibold">Public profile</h2>
        <p className="text-sm text-muted-foreground">
          This information is visible to anyone who views your profile.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <Input
            title="Username"
            inputPlaceholder="Username"
            {...register("username")}
          />
          {errors.username && (
            <p className="text-[0.8rem] font-medium text-destructive">
              {errors.username.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Input
            title="Name"
            inputPlaceholder="Name"
            {...register("full_name")}
          />
          {errors.full_name && (
            <p className="text-[0.8rem] font-medium text-destructive">
              {errors.full_name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Input
            title="Website"
            inputPlaceholder="Website"
            {...register("website")}
          />
          {errors.website && (
            <p className="text-[0.8rem] font-medium text-destructive">
              {errors.website.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Input title="Bio" inputPlaceholder="Bio" {...register("bio")} />
          {errors.bio && (
            <p className="text-[0.8rem] font-medium text-destructive">
              {errors.bio.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mb-5 md:mb-0">
          {isDirty && !isPending && (
            <span className="text-sm text-muted-foreground">
              Unsaved changes
            </span>
          )}
          <Button
            className="font-bold bg-mint"
            disabled={isPending || !isDirty || !isValid}
          >
            {isPending ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
