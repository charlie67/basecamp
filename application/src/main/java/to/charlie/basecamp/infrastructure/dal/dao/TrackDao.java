package to.charlie.basecamp.infrastructure.dal.dao;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import to.charlie.basecamp.infrastructure.dal.repository.RoutePointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.SeriesPointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.TrackChunkRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutEventRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutRepository;

@Component
@RequiredArgsConstructor
public class TrackDao {

	private final TrackChunkRepository trackChunkRepository;
	private final RoutePointRepository routePointRepository;
	private final SeriesPointRepository seriesPointRepository;
	private final WorkoutEventRepository workoutEventRepository;
	private final WorkoutRepository workoutRepository;


}
