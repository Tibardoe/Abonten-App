-- Abonten Safety, decision J3 (2026-10-22): Ghana's SOS screens show 112 only.
--
-- The Government of Ghana merged the police, fire and ambulance lines into
-- 112 on every mobile network in January 2020 and said the old 191, 192 and
-- 193 were no longer in use (Citi Newsroom, 28 January 2020, "Government
-- makes 112 new hotline for all emergency services"). Some travel advice
-- still lists the old codes (Government of Canada, March 2026), so they may
-- or may not answer. A button that rings a dead line costs seconds in an
-- emergency, so only 112 is shown until a Ghanaian authority confirms that
-- the others answer. Staff can change the list in Admin › Markets.

update public.market
set safety_config = jsonb_set(
  safety_config,
  '{emergencyNumbers}',
  jsonb_build_array(jsonb_build_object('service', 'all', 'number', '112'))
)
where country_code = 'GH';

do $$
begin
  if exists (select 1 from public.market where country_code = 'GH')
     and (select safety_config -> 'emergencyNumbers'
            from public.market where country_code = 'GH')
         <> '[{"service": "all", "number": "112"}]'::jsonb then
    raise exception 'migration check: Ghana should show 112 only';
  end if;
end;
$$;
