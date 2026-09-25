-- Production gate 2026-09-25, found by the advisors after rollout:
-- throttle_place_analytics_event() (20260925110600) is a SECURITY DEFINER
-- trigger function and kept the default EXECUTE for PUBLIC, so it was listed
-- as callable through /rest/v1/rpc. Calling a trigger function directly
-- fails, so nothing was exposed, but it is closed like the other definer
-- trigger functions. The trigger still fires for every inserting role:
-- EXECUTE is checked when a trigger is created, not when it fires.

revoke execute on function public.throttle_place_analytics_event()
  from public, anon, authenticated;
