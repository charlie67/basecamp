package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetForecastResponse;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetMapResponse;
import to.charlie.basecamp.domain.service.SunsetMapService;
import to.charlie.basecamp.domain.service.SunsetService;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Slf4j
@RestController
@RequestMapping("/sunset")
@RequiredArgsConstructor
public class SunsetController {

	private final SunsetService sunsetService;
	private final SunsetMapService sunsetMapService;

	@GetMapping
	public ResponseEntity<SunsetForecastResponse> getForecast(@RequestParam final double lat,
	                                                          @RequestParam final double lon) {
		log.info("GET /sunset - lat={} lon={}", lat, lon);
		// Written so that NaN fails too, which a plain range check would let through.
		if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
			throw new ResponseStatusException(BAD_REQUEST, "lat must be within ±90 and lon within ±180");
		}

		return ResponseEntity.ok(sunsetService.getForecast(lat, lon));
	}

	/** Scores across a whole area at once, for colouring the map with. */
	@GetMapping("/map")
	public ResponseEntity<SunsetMapResponse> getMap(@RequestParam final double south,
	                                                @RequestParam final double west,
	                                                @RequestParam final double north,
	                                                @RequestParam final double east) {
		log.info("GET /sunset/map - south={} west={} north={} east={}", south, west, north, east);
		// Written so that NaN fails too, as above.
		if (!(Math.abs(south) <= 90) || !(Math.abs(north) <= 90) || !(Math.abs(west) <= 180) || !(Math.abs(east) <= 180)
						|| !(south < north) || !(west < east)) {
			throw new ResponseStatusException(BAD_REQUEST,
							"south and north must be within ±90, west and east within ±180, and each pair in order");
		}

		return ResponseEntity.ok(sunsetMapService.getMap(south, west, north, east));
	}
}
