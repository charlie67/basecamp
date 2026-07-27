package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface RoutePointRepository extends JpaRepository<RoutePointEntity, Long> {

	void deleteByChunkId(UUID chunkId);

	long countByWorkoutId(UUID workoutId);

	List<RoutePointEntity> findByWorkoutIdInOrderByWorkoutIdAscTAsc(Collection<UUID> workoutIds);
}
