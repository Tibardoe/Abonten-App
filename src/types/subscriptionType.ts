export type SubscriptionType =
  | { status: number; message: string; data?: undefined }
  | {
      status: number;
      data: { id: number; subscription_plan: { name: string }[] };
      message?: undefined;
    };

// export type SubscriptionType = {
//   status: number;
//   message: string;
//   data?: {
//     id: number;
//     subscription_plan: { name: string };
//   };
// };
