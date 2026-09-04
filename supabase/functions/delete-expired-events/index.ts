// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Initialize Supabase client outside the handler for reuse
const supabase = createClient(Deno.env.get("URL"), Deno.env.get("SERVICE_ROLE_KEY"));
console.info("Server started");
Deno.serve(async (req)=>{
  try {
    // Paginate data to avoid overload (optional optimization)
    let page = 0;
    const limit = 1000;
    let allEvents = [];
    let done = false;
    while(!done){
      // DATA-006: skip events already archived by a previous run -- they
      // permanently fail a hard delete (real ledger/promotion history), so
      // re-fetching and re-attempting them every day is pure wasted work.
      const { data: events, error } = await supabase.from("event").select("*, event_occurrence(*)").is("archived_at", null).range(page * limit, (page + 1) * limit - 1);
      if (error) throw error;
      if (!events || events.length === 0) break;
      allEvents.push(...events);
      if (events.length < limit) done = true;
      else page++;
    }
    if (allEvents.length === 0) {
      return new Response(JSON.stringify({
        message: "No events found"
      }), {
        status: 200
      });
    }
    const now = new Date();
    const expiredEvents = allEvents.filter((event)=>{
      const occurrences = event.event_occurrence;

      // ✅ If event has occurrences
      if (occurrences?.length > 0) {
        // get the latest occurrence by end date
        const lastOccurrence = occurrences.reduce((latest, current) => {
          return new Date(current.ends_at) > new Date(latest.ends_at)
            ? current
            : latest;
        });

        return new Date(lastOccurrence.ends_at) < now;
      }

      // ✅ fallback to event's own end date
      return event.ends_at && new Date(event.ends_at) < now;
    });
    if (expiredEvents.length === 0) {
      return new Response(JSON.stringify({
        message: "No expired events found"
      }), {
        status: 200
      });
    }
    console.log(`Total expired events: ${expiredEvents.length}`);
    const chunks = chunkArray(expiredEvents, 50);
    const deletionResults = [];
    let chunkIndex = 0;
    for (const chunk of chunks){
      console.info(`Processing chunk ${++chunkIndex} of ${chunks.length}`);
      const results = await Promise.allSettled(chunk.map(async (event)=>{
        try {
          // DATA-006: hard-delete when possible, otherwise archive (soft
          // delete) instead of leaving the row in limbo -- an event with
          // real ledger earnings or a paid promotion checkout can never be
          // hard-deleted (it would violate organizer_ledger_entry's earning
          // CHECK constraint, or payment_attempt's RESTRICT on
          // event_promotion_checkout_id), so the RPC falls back to setting
          // archived_at instead of throwing.
          const { data: result, error: rpcError } = await supabase.rpc("archive_or_delete_expired_event", {
            p_event_id: event.id
          });
          if (rpcError) throw rpcError;
          // Only delete the Cloudinary flyer when the event row itself was
          // actually removed -- an archived event keeps its data (including
          // the flyer) intact for receipts/finance views.
          if (result?.hard_deleted && event.flyer_public_id) {
            await deleteFromCloudinary(event.flyer_public_id);
          }
          return {
            success: true,
            eventId: event.id,
            archived: !result?.hard_deleted
          };
        } catch (err) {
          console.error(`Failed to delete event ${event.id}:`, err);
          return {
            success: false,
            eventId: event.id,
            error: err.message
          };
        }
      }));
      deletionResults.push(...results);
    }
    // Development: console.table for visualization
    console.table(deletionResults.map((r)=>r.status === "fulfilled" ? r.value : {
        eventId: "unknown",
        success: false,
        error: r.reason?.message
      }));
    const failedDeletions = deletionResults.filter((r)=>r.status !== "fulfilled" || !r.value.success);
    const archivedCount = deletionResults.filter((r)=>r.status === "fulfilled" && r.value.success && r.value.archived).length;
    if (failedDeletions.length >= 5) {
      console.info(`Processing chunk ${++chunkIndex} of ${chunks.length}`);
      console.error(`Failed to delete event ${failedDeletions.length}:`);
    // await sendAlert(`⚠️ ${failedDeletions.length} event deletions failed.`);
    }
    return new Response(JSON.stringify({
      message: "Expired events processed",
      stats: {
        totalExpired: expiredEvents.length,
        successfullyDeleted: expiredEvents.length - failedDeletions.length - archivedCount,
        archived: archivedCount,
        failed: failedDeletions.length,
      }
    }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    // await sendAlert(`🚨 Critical error in expired event deletion: ${err.message}`);
    return new Response(JSON.stringify({
      error: "Internal server error"
    }), {
      status: 500
    });
  }
});
// Cloudinary helper
async function deleteFromCloudinary(publicId) {
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  if (!apiKey || !apiSecret || !cloudName) {
    throw new Error("Missing Cloudinary configuration");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await createSignature({
    public_id: publicId,
    timestamp
  }, apiSecret);
  const formData = new URLSearchParams({
    public_id: publicId,
    api_key: apiKey,
    timestamp: timestamp.toString(),
    signature
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  if (!response.ok || result.result !== "ok") {
    throw new Error(`Cloudinary deletion failed: ${JSON.stringify(result)}`);
  }
}
async function createSignature(params, apiSecret) {
  const sortedParams = Object.keys(params).sort().map((key)=>`${key}=${params[key]}`).join("&");
  const encoder = new TextEncoder();
  const data = encoder.encode(sortedParams + apiSecret);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}
function chunkArray(arr, size) {
  const chunks = [];
  for(let i = 0; i < arr.length; i += size){
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
// // Example alerting via Discord webhook (replace with real URL or email)
// async function sendAlert(message: string) {
//   const discordWebhook = Deno.env.get("DISCORD_ALERT_WEBHOOK");
//   if (!discordWebhook) return;
//   await fetch(discordWebhook, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ content: message }),
//   });
// }
