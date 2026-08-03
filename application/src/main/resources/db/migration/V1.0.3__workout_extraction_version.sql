-- How the client extracted this workout's time-series, as opposed to what the
-- series contains. content_hash covers only summary fields (distance, calories,
-- route point count), none of which move when the client starts reading the same
-- workout at a different resolution -- so it cannot answer "is this row current?".
--
-- Deliberately left null on existing rows rather than defaulted to 1. Null means
-- "uploaded before the client reported this", which is exactly the truth, and it
-- reads as stale against any current version, so those workouts re-upload.
alter table workout
    add column extraction_version integer;

comment on column workout.extraction_version is
    'Client extraction version the stored track was produced by; null = unknown (pre-dates the field).';
