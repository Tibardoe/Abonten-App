"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays } from "date-fns";
import Image from "next/image";
import React from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TimePicker } from "../atoms/timePicker";

const formSchema = z.object({
  //   dateTime: z.date(),
  dateTime: z.string(),
});

type DateTimeSchemaType = z.infer<typeof formSchema>;

export default function DateTimePicker() {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const form = useForm<DateTimeSchemaType>({
    resolver: zodResolver(formSchema),
  });

  function onSubmit(values: DateTimeSchemaType) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="dateTime"
          render={({ field }) => (
            <FormItem className="">
              {/* <FormLabel className="text-sm">Date and Time</FormLabel> */}

              <FormControl>
                <Popover>
                  <PopoverTrigger className="flex w-full justify-between items-center px-3">
                    <span>
                      {date?.from && date?.to
                        ? `${date?.from?.toISOString()}-${date?.to?.toISOString()}`
                        : "Date and Time"}

                      {date?.from &&
                        !date?.to &&
                        `${date?.from?.toISOString()}`}

                      {date?.to && !date?.from && `${date?.to?.toISOString()}`}
                    </span>
                    <Image
                      src="/assets/images/date.svg"
                      alt="Date"
                      height={20}
                      width={20}
                    />
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={date?.from}
                      selected={date}
                      onSelect={setDate}
                      numberOfMonths={1}
                    />

                    {/* <TimePicker setDate={field.onChange} date={field.value} /> */}
                  </PopoverContent>
                </Popover>
              </FormControl>
              {/* <FormDescription>
                This is your public display name.
              </FormDescription> */}
              <FormMessage />
            </FormItem>
          )}
        />
        {/* <Button type="submit">Submit</Button> */}
      </form>
    </Form>
  );
}
