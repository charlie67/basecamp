package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import to.charlie.basecamp.domain.model.ProviderEnum;
import to.charlie.basecamp.domain.service.MapTileService;

@Slf4j
@RestController
@RequestMapping("/tiles")
@RequiredArgsConstructor
public class MapTileController {

	private final MapTileService mapTileService;

	@GetMapping("/{provider}/{map}/{z}/{x}/{y}.png")
	public ResponseEntity<byte[]> getTile(@PathVariable final ProviderEnum provider, @PathVariable final String map,
	                                      @PathVariable final Integer z, @PathVariable final Integer x,
	                                      @PathVariable final Integer y) {

		return mapTileService.getMapTile(provider, map, z, x, y);
	}
}
