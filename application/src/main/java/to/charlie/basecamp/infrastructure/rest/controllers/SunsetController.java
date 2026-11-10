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
import to.charlie.basecamp.domain.service.SunsetService;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Slf4j
@RestController
@RequestMapping("/sunset")
@RequiredArgsConstructor
public class SunsetController {

	private final SunsetService sunsetService;

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
}
