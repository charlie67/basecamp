-- Indexes backing the /workouts/search endpoint (date range + map viewport).

-- Bounding-box lookups ask "does any of this workout's route pass through the
-- viewport". Postgres' built-in point/box types and their GiST opclass are core,
-- so this needs no PostGIS: point(lon, lat) <@ box(...) uses the index directly.
-- Note point is (x, y), hence longitude first.
create index idx_route_point_geo on route_point using gist (point(lon, lat));

-- The listing is ordered by end_date desc; the filter predicate is on start_date.
create index idx_workout_end_date on workout (end_date desc);
create index idx_workout_start_date on workout (start_date);
