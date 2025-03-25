"use client";

import Image from "next/image";
import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import { Button } from "../ui/button";

export default function SecurityInputFields() {
  const form = useForm();

  const { register } = form;

  return (
    <form className="flex flex-col gap-5">
      <Input title="Phone" inputPlaceholder="Phone" {...register("phone")} />

      <Input title="Email" inputPlaceholder="Email" {...register("email")} />

      <div className="flex justify-between items-center">
        <button
          type="button"
          className="text-red-700 flex items-center gap-1 font-bold md:text-lg"
        >
          <Image
            src="/assets/images/delete.svg"
            alt="Delete icon"
            width={40}
            height={40}
            className="w-6 h-6 md:w-8 md:h-8"
          />
          Delete account
        </button>

        <Button className="self-end font-bold">Update</Button>
      </div>
    </form>
  );
}
