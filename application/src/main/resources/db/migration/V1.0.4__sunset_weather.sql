-- Cache of the weather behind the sunset forecast, one row per tenth-of-a-degree
-- grid cell, overwritten in place whenever the cell is asked for after the row has
-- gone stale. The responses are stored as Open-Meteo sent them rather than as
-- scores, so the scoring can change without anything here needing to be refetched.
--
-- Rows are never deleted: one exists only for a cell somebody has clicked on, so
-- the table stays small without any clean-up.
create table sunset_weather (
    lat_tenths  integer     not null,
    lon_tenths  integer     not null,
    fetched_at  timestamptz not null,
    models      text        not null,
    forecast    jsonb       not null,
    path        jsonb       not null,
    aerosols    jsonb,
    primary key (lat_tenths, lon_tenths)
);

comment on column sunset_weather.models is
    'Comma-separated weather models the responses were fetched for; a row fetched for a different list is treated as stale.';
