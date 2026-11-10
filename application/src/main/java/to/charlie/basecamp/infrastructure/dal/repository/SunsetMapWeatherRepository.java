package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.SunsetMapPointId;
import to.charlie.basecamp.domain.model.entity.SunsetMapWeatherEntity;

@Repository
public interface SunsetMapWeatherRepository extends JpaRepository<SunsetMapWeatherEntity, SunsetMapPointId> {
}
