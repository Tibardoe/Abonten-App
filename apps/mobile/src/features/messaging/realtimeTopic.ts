// Why postgres_changes channels get a per-subscription topic suffix.
//
// RealtimeClient.channel(topic) returns an EXISTING channel when one with
// that topic is still registered:
//
//   const exists = this.getChannels().find((c) => c.topic === realtimeTopic)
//   if (!exists) { ...create... } else { return exists }
//
// and removeChannel() is async — it awaits channel.unsubscribe(), a socket
// round trip, before the channel is torn down and dropped from the client's
// list. So when an effect cleans up and immediately re-subscribes (a session
// change, a remount, Fast Refresh in dev), the new channel(<same topic>) call
// can hand back the OLD, already-subscribed channel. Adding a listener to it
// then throws
//
//   "cannot add `postgres_changes` callbacks for realtime:<topic>
//    after `subscribe()`"
//
// which is a render-time throw inside the hook's effect — it red-screened the
// whole tab layout from useInboxRealtime.
//
// A unique suffix makes that impossible: every subscription builds its own
// channel, and a lingering one can never be returned in its place. This is
// only safe for channels whose authorization does NOT depend on the topic
// name. postgres_changes streams qualify — they are authorized by the RLS on
// the tables they watch. The PRIVATE broadcast/presence channel
// `conversation:<id>` does not: RLS on realtime.messages is keyed on that
// exact topic, and web joins the same name for typing/presence, so it must
// keep its shared name.

let counter = 0;

/**
 * A collision-proof topic for a postgres_changes subscription.
 * `uniqueRealtimeTopic("inbox:123")` -> `"inbox:123#7"`.
 */
export function uniqueRealtimeTopic(base: string): string {
  counter += 1;
  return `${base}#${counter}`;
}
