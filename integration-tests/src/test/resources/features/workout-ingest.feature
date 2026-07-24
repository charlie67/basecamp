@WorkoutIngest
Feature: HealthKit workout ingest

  Scenario: A workout summary and its track chunk are persisted
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And the response body should contain the following fields:
      | healthkit_uuid | 5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F |
      | content_hash   | 9f2c8a                               |
      | id             | <valid_uuid>                         |
    And the "workout" table should contain 1 row
    And the "workout_statistic" table should contain 2 rows
    And the "workout_event" table should contain 1 row
    And the only "workout" row should have "type" equal to "hiking"
    And the only "workout" row should have "source_name" equal to "Apple Watch"
    And the only "workout" row should have "track_status" equal to "PENDING"
    And I store the value of "id" from the HTTP response as "WORKOUT_ID"

    When I send an HTTP POST request to "/workouts/{WORKOUT_ID}/track" with the body from file: "tracks/chunk-0.json"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | sequence | 0    |
      | received | true |
    And the "track_chunk" table should contain 1 row
    And the "route_point" table should contain 2 rows
    And the "series_point" table should contain 3 rows
    And the "workout_event" table should contain 2 rows
    And the only "workout" row should have "track_status" equal to "COMPLETE"
    And the only "workout" row should have "expected_chunks" equal to "1"

  Scenario: Re-posting the same summary upserts instead of duplicating
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And I store the value of "id" from the HTTP response as "FIRST_ID"

    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And the response body should contain the following fields:
      | id | {FIRST_ID} |
    And the "workout" table should contain 1 row
    And the "workout_statistic" table should contain 2 rows

  Scenario: A workout re-sent under a fresh uuid is matched by its type and start time
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And I store the value of "id" from the HTTP response as "FIRST_ID"

    # Same type and start_date, but a brand-new healthkit_uuid: the natural key catches the duplicate.
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary-new-uuid.json"
    Then "RESPONSE_STATUS" should be "201"
    And the response body should contain the following fields:
      | id             | {FIRST_ID}                           |
      | healthkit_uuid | AAAA1111-2222-3333-4444-555566667777 |
    And the "workout" table should contain 1 row
    # The original healthkit_uuid is preserved (it is not updatable).
    And the only "workout" row should have "healthkit_uuid" equal to "5b2e2a10-7c3d-4e9a-9f21-0a1b2c3d4e5f"
    And the only "workout" row should have "content_hash" equal to "different-hash"
