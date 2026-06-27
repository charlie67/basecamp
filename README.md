Endpoint 1 — POST /workouts (summary, one per workout)

  Sent first for each workout. Upsert by healthkit_uuid.

  POST /workouts HTTP/1.1
  Content-Type: application/json
  Idempotency-Key: 5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F
  Authorization: Bearer <token>        # only if you configure tokenProvider
  {
    "healthkit_uuid": "5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F",
    "type": "hiking",
    "start_date": "2026-06-19T14:32:00Z",
    "end_date": "2026-06-19T16:10:00Z",
    "duration_seconds": 5880,
    "distance_m": 8450.2,
    "elevation_gain_m": 612.5,
    "elevation_loss_m": 590.1,
    "active_calories": 940.0,
    "basal_calories": 220.0,
    "route_point_count": 1820,
    "content_hash": "9f2c8a…",
    "source": { "name": "Apple Watch", "bundle_id": "com.apple.health.…", "version": "10.5" },
    "device": { "name": "Apple Watch", "model": "Watch6,2", "manufacturer": "Apple Inc.",
                "hardware_version": "Watch6,2", "software_version": "10.5" },
    "metadata": { "HKElevationAscended": "612 m", "HKWeatherTemperature": 16.5, "HKIndoorWorkout": false },
    "statistics": {
      "heart_rate":           { "min": 88, "max": 162, "avg": 131.4, "sum": 0,     "unit": "count/min" },
      "active_energy_burned": { "min": 0.1, "max": 3.4, "avg": 1.2,  "sum": 940.0, "unit": "kcal" }
    },
    "events": [
      { "type": "lap", "start": "2026-06-19T14:50:00Z", "end": "2026-06-19T14:50:00Z", "metadata": null }
    ]
  }

  Required response (200/201):
  {
    "id": "srv_abc123",
    "healthkit_uuid": "5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F",
    "content_hash": "9f2c8a…",
    "updated_at": "2026-06-19T16:11:03Z"
  }
  - Must echo healthkit_uuid exactly (the client rejects a mismatch).
  - id is your record id — the app puts it in the next endpoint's URL.

  Endpoint 2 — POST /workouts/{id}/track (chunked time-series)

  After the summary succeeds, the app sends the route + every metric series in order, ~500 GPS points per chunk. {id} = the id from endpoint 1.

  POST /workouts/srv_abc123/track HTTP/1.1
  Content-Type: application/json
  Idempotency-Key: 5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F:0    # uuid:sequence
  Authorization: Bearer <token>
  {
    "healthkit_uuid": "5B2E2A10-7C3D-4E9A-9F21-0A1B2C3D4E5F",
    "sequence": 0,
    "chunk_count": 4,
    "final": false,
    "start": "2026-06-19T14:32:00Z",
    "end":   "2026-06-19T14:58:20Z",
    "route": [
      { "t": "2026-06-19T14:32:00Z", "lat": 51.2011, "lon": -3.0901,
        "altitude_m": 210.4, "ellipsoidal_altitude_m": 255.1,
        "horizontal_accuracy_m": 4.0, "vertical_accuracy_m": 3.0,
        "speed_mps": 1.4, "speed_accuracy_mps": 0.5,
        "course_deg": 270.0, "course_accuracy_deg": 5.0 }
    ],
    "series": {
      "heart_rate":           [ { "start": "2026-06-19T14:32:01Z", "end": "2026-06-19T14:32:01Z", "value": 118 } ],
      "active_energy_burned": [ { "start": "2026-06-19T14:32:05Z", "end": "2026-06-19T14:32:10Z", "value": 1.1 } ]
    },
    "events": [ { "type": "pause", "start": "2026-06-19T14:55:00Z", "end": "2026-06-19T14:55:00Z", "metadata": null } ]
  }

  Required response (200/201):
  { "workout_id": "srv_abc123", "sequence": 0, "received": true }

  The app then sends sequence: 1, 2, … up to chunk_count - 1; the last one has "final": true. So a single hike looks like:

  POST /workouts                          → { id: "srv_abc123", … }
  POST /workouts/srv_abc123/track   seq 0  final:false
  POST /workouts/srv_abc123/track   seq 1  final:false
  POST /workouts/srv_abc123/track   seq 2  final:false
  POST /workouts/srv_abc123/track   seq 3  final:true   ← track complete
