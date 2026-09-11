-- Covering index for reward_event.rule_id (the one foreign key the Phase 4
-- engine migration left unindexed; flagged by the FK-coverage check).
create index if not exists idx_reward_event_rule on public.reward_event (rule_id);
