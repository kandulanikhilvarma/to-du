-- 0010: the responder read model stops inventing data.
--
-- 0004 filled missing values with zeros, so an SOS sent without a GPS fix
-- showed responders a pin at 0,0 in the Gulf of Guinea, "last ping 0 min
-- ago" and 0% battery. Unknown is now NULL and the console says so.
--
-- It also listed the viewer's own events, with "I'm on my way" buttons that
-- RLS then rejected. A responder console shows other people's alerts only.
-- auth.uid() is NULL for the service role, so sos-fanout still reads every row.

create or replace view responder_events
with (security_invoker = true) as
select
  e.id,
  p.display_name                                          as person_name,
  e.state,
  floor(extract(epoch from (now() - e.created_at)) / 60)::int  as opened_minutes_ago,
  floor(extract(epoch from (now() - lp.ts)) / 60)::int    as last_ping_minutes_ago,
  coalesce(lp.battery_percent, e.battery_percent)::int    as battery_percent,
  lp.accuracy_metres::int                                 as accuracy_metres,
  st_y(lp.point::geometry)                                as lat,
  st_x(lp.point::geometry)                                as lng,
  e.place_label,
  e.transport,
  m.blood_group,
  m.allergies,
  m.medications
from sos_events e
join profiles p on p.id = e.user_id
left join medical_profiles m on m.user_id = e.user_id
left join lateral (
  select point, accuracy_metres, battery_percent, ts
  from location_pings
  where event_id = e.id
  order by ts desc
  limit 1
) lp on true
where e.state <> 'false_alarm'
  and e.user_id is distinct from auth.uid();
