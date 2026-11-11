package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import to.charlie.basecamp.domain.model.SunEvent;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetForecastResponse;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetMapResponse;
import to.charlie.basecamp.domain.service.SunsetMapService;
import to.charlie.basecamp.domain.service.SunsetService;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Slf4j
@RestController
@RequiredArgsConstructor
public class SunsetController {

	// The sunset and the sunrise are the same two endpoints under either name.
	private static final String EVENT = "/{event:sunset|sunrise}";

	private final SunsetService sunsetService;
	private final SunsetMapService sunsetMapService;

	@GetMapping(EVENT)
	public ResponseEntity<SunsetForecastResponse> getForecast(@PathVariable final String event,
	                                                          @RequestParam final double lat,
	                                                          @RequestParam final double lon) {
		log.info("GET /{} - lat={} lon={}", event, lat, lon);
		// Written so that NaN fails too, which a plain range check would let through.
		if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
			throw new ResponseStatusException(BAD_REQUEST, "lat must be within ±90 and lon within ±180");
		}

		return ResponseEntity.ok(sunsetService.getForecast(event(event), lat, lon));
	}

	/** Scores across a whole area at once, for colouring the map with. */
	@GetMapping(EVENT + "/map")
	public ResponseEntity<SunsetMapResponse> getMap(@PathVariable final String event,
	                                                @RequestParam final double south,
	                                                @RequestParam final double west,
	                                                @RequestParam final double north,
	                                                @RequestParam final double east) {
		log.info("GET /{}/map - south={} west={} north={} east={}", event, south, west, north, east);
		// Written so that NaN fails too, as above.
		if (!(Math.abs(south) <= 90) || !(Math.abs(north) <= 90) || !(Math.abs(west) <= 180) || !(Math.abs(east) <= 180)
						|| !(south < north) || !(west < east)) {
			throw new ResponseStatusException(BAD_REQUEST,
							"south and north must be within ±90, west and east within ±180, and each pair in order");
		}

		return ResponseEntity.ok(sunsetMapService.getMap(event(event), south, west, north, east));
	}

	private static SunEvent event(final String name) {
		return SunEvent.of(name).orElseThrow(() -> new ResponseStatusException(NOT_FOUND));
	}
}
