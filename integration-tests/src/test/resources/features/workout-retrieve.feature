@WorkoutRetrieve
Feature: Retrieve Workout


  Scenario: Search with no filters returns everything
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    # Search is not paged: every match comes back in one array, so the filters are
    # what keeps the response small.
    When I send an HTTP GET request to "/workouts/search"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $[0].type  | hiking |
      | $.length() | 1      |

  Scenario: Search narrows the listing to a date range
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"

    # The workout starts 2026-06-19T14:32:00Z, so a range covering that day matches it.
    When I send an HTTP GET request to "/workouts/search?from=2026-06-19T00:00:00Z&to=2026-06-20T00:00:00Z"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $[0].type  | hiking |
      | $.length() | 1      |

    # The upper bound is exclusive, so the day the workout starts on excludes it.
    When I send an HTTP GET request to "/workouts/search?from=2026-06-18T00:00:00Z&to=2026-06-19T00:00:00Z"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 0 |

    # An open-ended range applies only the bound it was given.
    When I send an HTTP GET request to "/workouts/search?from=2026-06-01T00:00:00Z"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 1 |

  Scenario: Search narrows the listing to the area shown on the map
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And I store the value of "id" from the HTTP response as "WORKOUT_ID"
    When I send an HTTP POST request to "/workouts/{WORKOUT_ID}/track" with the body from file: "tracks/chunk-0.json"
    Then "RESPONSE_STATUS" should be "200"

    # The route runs through (46.1, 7.1) to (46.2, 7.2).
    When I send an HTTP GET request to "/workouts/search?min_lat=46.0&max_lat=46.3&min_lon=7.0&max_lon=7.3"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $[0].type  | hiking |
      | $.length() | 1      |

    # A viewport somewhere else does not show it.
    When I send an HTTP GET request to "/workouts/search?min_lat=51.4&max_lat=51.6&min_lon=-0.2&max_lon=0.05"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 0 |

    # A half-supplied viewport is dropped rather than guessed at, leaving a date-only search.
    When I send an HTTP GET request to "/workouts/search?min_lat=51.4&max_lat=51.6"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 1 |

  Scenario: Date and area filters combine
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And I store the value of "id" from the HTTP response as "WORKOUT_ID"
    When I send an HTTP POST request to "/workouts/{WORKOUT_ID}/track" with the body from file: "tracks/chunk-0.json"
    Then "RESPONSE_STATUS" should be "200"

    When I send an HTTP GET request to "/workouts/search?from=2026-06-19T00:00:00Z&to=2026-06-20T00:00:00Z&min_lat=46.0&max_lat=46.3&min_lon=7.0&max_lon=7.3"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 1 |

    # Right area, wrong day: both predicates have to hold.
    When I send an HTTP GET request to "/workouts/search?from=2026-06-20T00:00:00Z&min_lat=46.0&max_lat=46.3&min_lon=7.0&max_lon=7.3"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 0 |


  Scenario: A workout's heart rate series is fetched on its own
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    And I store the value of "id" from the HTTP response as "WORKOUT_ID"
    When I send an HTTP POST request to "/workouts/{WORKOUT_ID}/track" with the body from file: "tracks/chunk-0.json"
    Then "RESPONSE_STATUS" should be "200"

    # Kept off the search response, which carries every track in the viewport: the
    # detail panel asks for the series of the one workout it has open.
    When I send an HTTP GET request to "/workouts/{WORKOUT_ID}/series/heart_rate"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 3                    |
      | $[0].t     | 2026-06-19T14:32:00Z |
      | $[0].v     | 120.0                |
      | $[2].v     | 125.0                |

    # Both ends of the sample come back: older exports send one value averaged over a
    # whole track chunk, and a chart given only the start cannot tell how much of the
    # walk that value stands for.
    And the response body should contain the following fields:
      | $[0].e | 2026-06-19T14:32:01Z |

    # A metric this workout never recorded is an empty series rather than a 404 —
    # "no heart rate on this walk" is an ordinary answer.
    When I send an HTTP GET request to "/workouts/{WORKOUT_ID}/series/step_count"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | $.length() | 0 |

  Scenario: The workout listing exposes the summary stats the map panel shows
    When I send an HTTP POST request to "/workouts" with the body from file: "workouts/hiking-summary.json"
    Then "RESPONSE_STATUS" should be "201"
    When I send an HTTP GET request to "/workouts"
    Then "RESPONSE_STATUS" should be "200"
    And the response body should contain the following fields:
      | content[0].type                                | hiking    |
      | content[0].duration_seconds                    | 5880.0    |
      | content[0].distance_m                          | 8450.2    |
      | content[0].elevation_gain_m                    | 612.5     |
      | content[0].elevation_loss_m                    | 590.1     |
      | content[0].active_calories                     | 940.0     |
      | content[0].basal_calories                      | 220.0     |
      | content[0].route_point_count                   | 1820      |
      | content[0].statistics.heart_rate.avg           | 131.4     |
      | content[0].statistics.heart_rate.max           | 162.0     |
      | content[0].statistics.heart_rate.unit          | count/min |
      | content[0].statistics.active_energy_burned.sum | 940.0     |
