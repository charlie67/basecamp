package to.charlie.integrationTests.basecamp.steps;

import io.cucumber.java.After;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

public class Hooks {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@After
	public void resetDatabase() {
		// Clean slate per scenario so row-count assertions stay deterministic. Truncating workout with
		// CASCADE clears every child table (statistics, chunks, events, points) via their FKs.
		jdbcTemplate.execute("TRUNCATE TABLE workout RESTART IDENTITY CASCADE");
	}
}
