-- A workout is uniquely identified by its HealthKit uuid (already unique) and, as a natural key,
-- by its (type, start_date): the same activity type cannot start at two instants, and no two
-- workouts share one start instant. This guards against duplicates re-sent under a fresh uuid.
alter table workout
    add constraint uq_workout_type_start unique (type, start_date);
