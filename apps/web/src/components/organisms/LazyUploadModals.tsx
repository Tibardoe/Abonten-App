"use client";

import { lazyWithMessages } from "@/i18n/lazyWithMessages";

// The create-event and create-place forms, loaded when someone opens them.
// They are reachable from the header on every page, so importing them
// directly put their code and several hundred of their messages into every
// page of the site.
export const EventUploadModal = lazyWithMessages(
  "EventUploadModal",
  () => import("@/components/organisms/EventUploadModal"),
);

export const PlaceUploadModal = lazyWithMessages(
  "PlaceUploadModal",
  () => import("@/places/organisms/PlaceUploadModal"),
);
