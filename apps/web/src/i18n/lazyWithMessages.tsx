"use client";

import dynamic from "next/dynamic";
import { type ComponentType, useEffect } from "react";
import { useNamespaces } from "./MessageLoader";
import lazyNamespaces from "./lazyNamespaces.generated.json";

export type LazyBoundary = keyof typeof lazyNamespaces;

// A component that opens later (the create-event form, the create-place
// form) is not part of any page until someone asks for it: neither its
// code nor its words. This loads both the first time it is shown, each as
// its own cached file, and renders it once they are here.
//
//   const EventUploadModal = lazyWithMessages(
//     "EventUploadModal",
//     () => import("@/components/organisms/EventUploadModal"),
//   );
//
// The name is how scripts/i18n/gen-route-messages.mjs lists the namespaces
// the component reads (i18n/lazyNamespaces.generated.json): the analysis
// stops at this boundary, so the pages that can open it do not carry its
// messages.
export function lazyWithMessages<Props extends object>(
  name: LazyBoundary,
  load: () => Promise<{ default: ComponentType<Props> }>,
): ComponentType<Props> {
  const Loaded = dynamic(load, { ssr: false });
  const namespaces: readonly string[] = lazyNamespaces[name];

  // Code and words at the same time, not one after the other.
  const warm = () => {
    load().catch(() => {});
  };

  function WithMessages(props: Props) {
    const ready = useNamespaces(namespaces);
    useEffect(warm, []);
    return ready ? <Loaded {...props} /> : null;
  }
  WithMessages.displayName = `WithMessages(${name})`;
  return WithMessages;
}
