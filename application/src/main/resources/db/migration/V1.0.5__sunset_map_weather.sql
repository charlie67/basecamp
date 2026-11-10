-- Cache of the weather behind the sunset map overlay, one row per point of the
-- lattice the overlay is scored on, overwritten in place once the row has gone
-- stale. Points are keyed in hundredths of a degree, so the coarser lattices used
-- when zoomed out share rows with the finer ones wherever their points coincide.
--
-- Stored as Open-Meteo sent it rather than as scores, like sunset_weather, so the
-- scoring can change without anything here needing to be refetched.
create table sunset_map_weather (
    lat_hundredths  integer     not null,
    lon_hundredths  integer     not null,
    fetched_at      timestamptz not null,
    model           text        not null,
    forecast        jsonb       not null,
    primary key (lat_hundredths, lon_hundredths)
);

comment on column sunset_map_weather.model is
    'The weather model the forecast was fetched for; a row fetched for a different one is treated as stale.';
