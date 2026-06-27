package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.SeriesPointEntity;

import java.util.UUID;

@Repository
public interface SeriesPointRepository extends JpaRepository<SeriesPointEntity, Long> {

	void deleteByChunkId(UUID chunkId);

	long countByWorkoutId(UUID workoutId);
}
