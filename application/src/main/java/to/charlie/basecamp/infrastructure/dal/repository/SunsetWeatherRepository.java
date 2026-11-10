package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.SunsetCellId;
import to.charlie.basecamp.domain.model.entity.SunsetWeatherEntity;

@Repository
public interface SunsetWeatherRepository extends JpaRepository<SunsetWeatherEntity, SunsetCellId> {
}
