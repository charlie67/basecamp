-- The sunrise is forecast the same way as the sunset, but its light arrives from
-- the east, so the cloud along its path is at different places. Each cell
-- therefore gets a row per event rather than one for both.
--
-- The rows already here are all sunsets.
alter table sunset_weather add column event text not null default 'SUNSET';
alter table sunset_weather alter column event drop default;

alter table sunset_weather drop constraint sunset_weather_pkey;
alter table sunset_weather add primary key (lat_tenths, lon_tenths, event);

comment on column sunset_weather.event is
    'SUNSET or SUNRISE: which of the two the forecast''s times and path are for.';
